/*
trilium-drawio
https://github.com/SiriusXT/trilium-drawio
version:0.7
*/

// ==================== DrawIO Configuration ====================
const drawioConfig = {
	// Theme mode: "light" | "dark" | "trilium" (follow trilium preference)
	theme: "trilium",

	// DrawIO embed URL (default is official hosted version; can be self-hosted)
	host: 'https://embed.diagrams.net',

	// UI theme: kennedy | min | atlas | dark | sketch | simple
	ui: 'min',

	// Save a snapshot revision before opening the drawio editor
	saveRevision: true,
}


// ==================== Widget implementation, no modification required ====================

var themeStyle = getComputedStyle(document.documentElement).getPropertyValue('--theme-style');
const styleContent = `.note-detail-image-wrapper:has(> .iframe-drawio) > :not(.iframe-drawio) {
	display:none;
}

.iframe-drawio iframe {
	z-index: 100;
}

.iframe-drawio.dark {
	filter: invert(88%) hue-rotate(180deg);
}

.iframe-drawio iframe {
	border: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	height: 100%;
}

.iframe-drawio {
	z-index: 100;
	border: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	height: 100%;
}

.iframe-drawio-controller {
	position: absolute;
	top: 8px;
	right: 8px;
	padding: 0px 4px;
	border-radius: 5px;
	color: #837d7d;
	box-shadow:
		inset 0 0 0 1px rgba(0, 0, 0, 0.11),
		inset 0 -1px 0 0 rgba(0, 0, 0, 0.08),
		0 1px 2px rgba(0, 0, 0, 0.1);
}

.iframe-drawio-controller > div {
	cursor: pointer;
	padding: 6px;
}`;

const styleElement = document.createElement('style');
styleElement.id = 'drawio-style';
styleElement.textContent = styleContent;
document.head.appendChild(styleElement);

// https://github.com/jgraph/drawio/discussions/5612
const defaultDrawioParams = {
	embed: 1,        // Enable embed mode
	ui: drawioConfig.ui ?? 'min', // Minimal UI
	spin: 1,         // Show loading spinner
	proto: 'json',   // Use JSON messaging protocol
	configure: 1,    // Wait for configure message
	libraries: 1,    // Enable shape libraries
	math: 1,         // Enable mathematical formulas
	noSaveBtn: 1,    // Hide save button
	noExitBtn: 1,    // Hide exit button
	saveAndExit: 0,   // Do not exit after saving
}
const drawioUrl = `${drawioConfig.host.replace(/\/+$/, '')}/?${new URLSearchParams(defaultDrawioParams)}`;

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
		return super.isEnabled() && this.note?.mime === "image/svg+xml";
	}

	doRender() {
		this.$widget = $(``);
		return this.$widget;
	}

	async refreshWithNote(note) {
		clearInterval(this.addClickTimer);
		await this.initialized;

		const content = (await note.getBlob()).content;
		if (!content.includes("mxfile")) return;

		const iframeDrawio = document.querySelector(`#center-pane .note-split[data-ntx-id="${this.noteContext.ntxId}"] .iframe-drawio`);
		if (iframeDrawio) {
			iframeDrawio.remove();
		}
		this._isNewlyCreated =
			Date.now() - new Date((await note.getMetadata()).utcDateCreated).getTime() < 2000
			&& !/<(line|polyline|polygon|path)(\s|>)/i.test(content);
		if (note.hasLabel("originalFileName") && note.getLabel("originalFileName").value == "drawio.svg" && this._isNewlyCreated) {
			await request('PUT', `/api/notes/${this.noteId}/title`, {
				title: note.title + ".drawio.svg"
			});
		}
		this.addClick();

	}
	async entitiesReloadedEvent({ loadResults }) {
		if (loadResults.isNoteContentReloaded(this.noteId)) {
			// Automatically sync the Draw.io editor when editing the same note
			const content = (await this.note.getBlob()).content;
			if (this.lastSyncedContent !== content && content.includes("mxfile")) {
				this.iframeDrawio?.querySelector('iframe')?.contentWindow?.postMessage(JSON.stringify({
					action: "merge",
					xml: content
				}), '*');
				
				clearTimeout(this._ignoreAutosaveTimer);
				this._ignoreAutosave = true;
				this._ignoreAutosaveTimer = setTimeout(() => {
					this._ignoreAutosave = false;
				}, 2000);
			}
		}
	}

	addClick(autoEdit) {
		let count = 0;
		this.addClickTimer = setInterval(() => {
			const imgWrapper = document.querySelector(`#center-pane .note-split[data-ntx-id="${this.noteContext?.ntxId}"] div.note-detail-image-wrapper`);

			if (imgWrapper) {
				imgWrapper.removeEventListener('click', this.edit);
				imgWrapper.addEventListener('click', this.edit);

				if (this._isNewlyCreated) {
					this.edit();
				}

				clearInterval(this.addClickTimer);
				return;
			}

			count++;

			if (count >= 50) {
				clearInterval(this.addClickTimer);
			}
		}, 100);
	}

	edit = async (event) => {
		if (drawioConfig.saveRevision) {
			api.triggerCommand("forceSaveRevision");
		}

		const iframeDrawio = document.createElement('div');
		this.iframeDrawio = iframeDrawio;
		iframeDrawio.className =
			'iframe-drawio' +
			(themeStyle.includes('dark') && drawioConfig.theme !== 'light'
				? ' dark'
				: '');

		iframeDrawio.innerHTML = `
		<div class="iframe-drawio-controller">
			<div class="drawio-switch-theme bx bx-sun" title="Drawio Switch Theme"></div>
			<div class="drawio-save-and-close bx bx-x" title="Drawio Close and Exit"></div>
		</div>
		<iframe
			frameborder="0"
			allow="clipboard-write"
			src="${drawioUrl}">
		</iframe>`;
		const imgWrapper = document.querySelector(`#center-pane .note-split[data-ntx-id="${this.noteContext?.ntxId}"] div.note-detail-image-wrapper`);
		imgWrapper.appendChild(iframeDrawio);

		const close = function () {
			window.removeEventListener('message', receive);
			iframeDrawio.remove();
		};

		iframeDrawio.querySelector('.iframe-drawio-controller')
			.addEventListener('click', (event) => {
				event.stopPropagation();
				const target = event.target.closest('div');
				if (!target) return;
				if (target.classList.contains('drawio-switch-theme')) {
					iframeDrawio.classList.toggle('dark');
				} else if (target.classList.contains('drawio-save-and-close')) {
					close();
				}
			});

		const iframe = iframeDrawio.querySelector('iframe');

		const receive = async (evt) => {
			const win = iframe?.contentWindow;
			if (!evt.data || !iframeDrawio || !win || evt.source !== win || evt.origin !== drawioConfig.host) {
				return;
			}

			const msg =
				typeof evt.data === "string"
					? JSON.parse(evt.data)
					: evt.data;

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
						xml: content
					}), '*');
					break;
				case 'autosave':
				case 'save':
					if (!this._ignoreAutosave) {
						win.postMessage(JSON.stringify({
							action: 'export',
							format: 'xmlsvg',
							spin: 'Updating page'
						}), '*');
					}
					break;
				case 'export': {
					if (msg.format === 'svg' && !msg.filename) {
						const base64 = msg.data.split(',')[1];
						const decoded = atob(base64);
						this.lastSyncedContent = decoded;
						await request('PUT', `/api/notes/${this.noteId}/data`, {
							content: decoded
						});
					}
					break;
				}
				case 'exit':
					close();
					break;
			}
		};

		window.addEventListener('message', receive);
		const timer = setInterval(() => {
			if (!iframeDrawio.isConnected) {
				close();
				clearInterval(timer);
			}
		}, 10000);
	}
}

window.onbeforeunload = () => {
	document.querySelectorAll('.iframe-drawio').forEach(el => el.remove());
};