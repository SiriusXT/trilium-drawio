/*
trilium-drawio
https://github.com/SiriusXT/trilium-drawio
version:0.7
*/

// ==================== DrawIO Configuration ====================
const drawioConfig = {
	// Theme mode: "light" | "dark" | "auto"
	theme: "auto",

	// DrawIO embed URL (default is official hosted version; can be self-hosted)
	host: 'https://embed.diagrams.net',

	// UI: kennedy | min | atlas | dark | sketch | simple
	ui: 'min',

	// Save a snapshot revision before opening the drawio editor
	saveRevision: true,
}


// ==================== Widget implementation, no modification required ====================

const styleContent = `.note-detail-image-wrapper:has(> .iframe-drawio) > :not(.iframe-drawio) {
	display:none;
}

.iframe-drawio {
	z-index: 100;
	border: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	height: 100%;
}

.iframe-drawio iframe {
	border: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	height: 100%;
}`;

const styleElement = document.createElement('style');
styleElement.textContent = styleContent;
document.head.appendChild(styleElement);

// https://github.com/jgraph/drawio/discussions/5612
// https://github.com/jgraph/drawio/discussions/5615
const defaultDrawioParams = {
	embed: 1,        // Enable embed mode
	ui: drawioConfig.ui ?? 'min', // Minimal UI
	spin: 1,         // Show loading spinner
	proto: 'json',   // Use JSON messaging protocol
	configure: 1,    // Wait for configure message
	libraries: 1,    // Enable shape libraries
	math: 1,         // Enable mathematical formulas
	noSaveBtn: 1,    // Hide save button
	noExitBtn: 0,    // Hide exit button
	saveAndExit: 0,   // Do not exit after saving
	dark: drawioConfig.theme?.includes('dark')
		? 1
		: drawioConfig.theme?.includes('light')
			? 0
			: 'auto'
}
const drawioOrigin = new URL(drawioConfig.host).origin;

const drawioUrl = `${drawioOrigin}/?${new URLSearchParams(defaultDrawioParams)}`;

async function request(method, path, body) {
	const res = await fetch(path, {
		method,
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			'X-CSRF-Token': window.glob?.csrfToken
		},
		body: body ? JSON.stringify(body) : undefined
	});

	return res.json().catch(() => null);
}

module.exports = class extends api.NoteContextAwareWidget {
	get position() {
		return 100;
	}

	static get parentWidget() {
		return 'note-detail-pane';
	}

	isEnabled() {
		return super.isEnabled();
	}

	doRender() {
		this.$widget = $(``);
		return this.$widget;
	}

	async refreshWithNote(note) {
		this.imgWrapper?.removeEventListener('click', this.createDrawioEditor);
		this.closeDrawio();
		clearInterval(this.initImageClickTimer);

		if (this.note?.mime !== "image/svg+xml") return;


		await this.initialized;

		const content = (await note.getBlob()).content;
		if (!content.includes("mxfile")) return;

		// Check whether this is a newly created blank Draw.io note
		this.isNewlyCreated =
			Date.now() - new Date((await note.getMetadata()).utcDateCreated).getTime() < 2000
			&& !/<(line|polyline|polygon|path)(\s|>)/i.test(content);

		if (note.hasLabel("originalFileName") && note.getLabel("originalFileName").value == "drawio.svg" && this.isNewlyCreated) {
			await request('PUT', `/api/notes/${this.noteId}/title`, {
				title: note.title + ".drawio.svg"
			});
		}

		this.initImageClick();
	}

	initImageClick(autoEdit) {
		let count = 0;
		this.initImageClickTimer = setInterval(() => {
			if (!this.imgWrapper?.isConnected) {
				this.imgWrapper = document.querySelector(`#center-pane .note-split[data-ntx-id="${this.noteContext?.ntxId}"] .note-detail-image-wrapper`);
			}
			if (this.imgWrapper) {
				this.imgWrapper.removeEventListener('click', this.createDrawioEditor);
				this.imgWrapper.addEventListener('click', this.createDrawioEditor);

				if (this.isNewlyCreated) {
					this.createDrawioEditor();
				}

				clearInterval(this.initImageClickTimer);
				return;
			}

			count++;

			if (count >= 30) {
				clearInterval(this.initImageClickTimer);
			}
		}, 200);
	}

	closeDrawio = () => {
		window.removeEventListener('message', this.receiveDrawio);
		this.iframeDrawio?.remove();
	}

	receiveDrawio = async (evt) => {
		const win = this.iframeDrawio.querySelector('iframe')?.contentWindow;
		if (!evt.data || !this.iframeDrawio || !win || evt.source !== win || evt.origin !== drawioOrigin) {
			return;
		}

		const msg = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;

		switch (msg?.event) {
			case 'configure':
				win.postMessage(JSON.stringify({
					action: 'configure',
					config: { css: " " }
				}), '*');
				break;
			case 'init':
				const content = (await this.note.getBlob()).content;
				win.postMessage(JSON.stringify({
					action: 'load',
					autosave: 1,
					xml: content,
				}), '*');
				break;
			case 'autosave':
			case 'save':
				win.postMessage(JSON.stringify({
					action: 'export',
					format: 'xmlsvg',
				}), '*');
				break;
			case 'export': {
				if (msg.format === 'svg' && !msg.filename) {
					const base64 = msg.data.split(',')[1];
					const decoded = atob(base64);
					this.blockMerge = true;
					await request('PUT', `/api/notes/${this.noteId}/data`, {
						content: decoded
					});
					// Notify Draw.io that the document has been successfully saved externally (Trilium),
					// and reset the internal dirty state to prevent the "discard changes" confirmation dialog on exit.
					win.postMessage(JSON.stringify({
						action: "status",
						modified: false
					}), "*");
				}
				break;
			}
			case 'exit':
				this.closeDrawio();
				break;
		}
	};

	createDrawioEditor = async (event) => {
		if (!event?.target.closest('.image-viewer-viewport') && !event?.target.classList.contains('note-detail-image-wrapper') && !event?.target.classList.contains('note-detail-image-view')) return;

		if (drawioConfig.saveRevision) {
			api.triggerCommand("forceSaveRevision");
		}

		this.iframeDrawio = document.createElement('div');
		this.iframeDrawio.classList.add('iframe-drawio');
		this.iframeDrawio.innerHTML = `<iframe frameborder="0" allow="clipboard-write" src="${drawioUrl}"></iframe>`;
		this.imgWrapper.appendChild(this.iframeDrawio);

		window.addEventListener('message', this.receiveDrawio);
		const timer = setInterval(() => {
			if (!this.iframeDrawio?.isConnected) {
				this.closeDrawio();
				clearInterval(timer);
			}
		}, 10000);
	}

	async entitiesReloadedEvent({ loadResults }) {
		if (loadResults.isNoteContentReloaded(this.noteId)) {
			// Automatically sync the Draw.io editor when editing the same note
			if (!this.blockMerge) {
				const content = (await this.note.getBlob()).content;
				this.iframeDrawio?.querySelector('iframe')?.contentWindow?.postMessage(JSON.stringify({
					action: 'load',
					autosave: 1,
					xml: content
				}), '*');
			} else {
				this.blockMerge = false;
			}
		}
	}
}

window.onbeforeunload = () => {
	document.querySelectorAll('.iframe-drawio').forEach(el => el.remove());
};