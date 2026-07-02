/*
trilium-drawio
https://github.com/SiriusXT/trilium-drawio
version:0.7.1
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

const styleContent = `
.scrolling-container:has(> .drawio-iframe)> :not(.drawio-iframe) {
    display: none;
}

.drawio-iframe {
    width: 100%;
    height: 100%;
}

body.zen .note-split.mime-image-svg-xml .ribbon-button-container {
    display: flex !important;
}

body.zen .note-split.mime-image-svg-xml .title-row .drawio-edit.icon-action {
    display: block !important;
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

	let data = null;
	try {
		data = await res.json();
	} catch { }

	if (!res.ok) {
		api.showMessage("Draw.io failed to save!");
		throw new Error(data?.message || `HTTP ${res.status}`);
	}
}

module.exports = class extends api.NoteContextAwareWidget {
	get position() {
		return 30;
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
		await this.initialized;

		const content = (await note.getBlob()).content;
		if (!content.includes("<mxfile") && !content.includes("&lt;mxfile")) {
			this.removeEditButton();
			return;
		}

		if (!this.editButton) {
			const noteSplit = await this.waitForElement(`#center-pane .note-split[data-ntx-id="${this.noteContext?.ntxId}"]`);
			const buttonContainer = await this.waitForElement(['.note-actions-custom', '.ribbon-button-container'], parent = noteSplit);

			this.editButton = Object.assign(document.createElement('button'), {
				className: 'drawio-edit icon-action bx bx-edit',
				onclick: () => this.createDrawioEditor()
			});
			buttonContainer?.prepend(this.editButton);
		}

		// Check whether this is a newly created blank Draw.io note
		const isNewlyCreated =
			Date.now() - (this.noteTypeChangeTime ?? new Date((await note.getMetadata()).utcDateCreated).getTime()) < 2000
			&& !/<(line|polyline|polygon|path)(\s|>)/i.test(content);

		if (isNewlyCreated) {
			await request('PUT', `/api/notes/${this.noteId}/title`, {
				title: note.title + ".drawio.svg"
			});
			this.createDrawioEditor();
		}
	}

	async createDrawioEditor() {
		if (this.drawioIframe) {
			return;
		}
		if (drawioConfig.saveRevision) {
			api.triggerCommand("forceSaveRevision");
		}

		this.drawioIframe = Object.assign(document.createElement('iframe'), {
			className: 'drawio-iframe',
			frameBorder: '0',
			allow: 'clipboard-write',
			src: drawioUrl
		});

		(await this.waitForElement(`#center-pane .note-split[data-ntx-id="${this.noteContext?.ntxId}"] .scrolling-container`))?.appendChild(this.drawioIframe);

		window.addEventListener('message', this.receiveDrawio);
		clearInterval(this.drawioCheckTimer);
		this.drawioCheckTimer = setInterval(() => {
			if (!this.drawioIframe?.isConnected) {
				this.closeDrawioEditor();
			}
		}, 10000);
	}

	waitForElement(selectors, parent = document, maxAttempts = 25, interval = 200) {
		selectors = Array.isArray(selectors) ? selectors : [selectors];
		return new Promise((resolve, reject) => {
			let attempts = 0;
			clearInterval(this.waitForElementTimer);
			this.waitForElementTimer = setInterval(() => {
				attempts++;
				for (const selector of selectors) {
					const element = parent?.querySelector(selector);
					if (element) {
						clearInterval(this.waitForElementTimer);
						resolve(element);
						return;
					}
				}
				if (attempts >= maxAttempts) {
					clearInterval(this.waitForElementTimer);
					resolve(null);
				}
			}, interval);
		});
	}

	closeDrawioEditor() {
		clearInterval(this.drawioCheckTimer);
		this.drawioCheckTimer = undefined;
		window.removeEventListener('message', this.receiveDrawio);
		this.drawioIframe?.remove();
		this.drawioIframe = undefined;
	}

	removeEditButton() {
		clearInterval(this.waitForButtonContainerTimer);
		this.waitForButtonContainerTimer = undefined;
		this.editButton?.remove();
		this.editButton = undefined;
	}

	receiveDrawio = async (evt) => {
		const win = this.drawioIframe?.contentWindow;
		if (!evt.data || !this.drawioIframe || !win || evt.source !== win || evt.origin !== drawioOrigin) {
			return;
		}

		const msg = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;

		switch (msg?.event) {
			case 'configure':
				win.postMessage(JSON.stringify({
					action: 'configure',
					config: { css: 'a[href="https://github.com/jgraph/drawio"] { display: none !important; }' }
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
				if (msg.message.format === 'xmlsvg' && !msg.filename) {
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
				this.closeDrawioEditor();
				break;
		}
	};

	async noteSwitched() {
		if (this.note?.mime !== "image/svg+xml") {
			this.removeEditButton();
		}

		this.closeDrawioEditor();
		await this.refresh();
	}

	async noteTypeMimeChangedEvent({ noteId }) {
		if (this.isNote(noteId)) {
			if (this.isEnabled() && !this.editButton) {
				this.noteTypeChangeTime = Date.now();
				await this.refresh();
			} else if (!this.isEnabled() && this.editButton) {
				this.removeEditButton();
				this.closeDrawioEditor();
			}
		}
	}

	async entitiesReloadedEvent({ loadResults }) {
		if (this.noteId && loadResults.isNoteContentReloaded(this.noteId)) {
			// Automatically sync the Draw.io editor when editing the same note
			if (!this.blockMerge) {
				const content = (await this.note.getBlob()).content;
				this.drawioIframe?.contentWindow?.postMessage(JSON.stringify({
					action: 'load',
					autosave: 1,
					xml: content
				}), '*');
			} else {
				this.blockMerge = undefined;
			}
		}
	}
}

window.onbeforeunload = () => {
	document.querySelectorAll('.drawio-iframe').forEach(el => el.remove());
};