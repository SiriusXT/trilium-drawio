/*
trilium-drawio
https://github.com/SiriusXT/trilium-drawio
version:0.7 (patched)
*/

var defaultTheme = "2" //0:light;1:dark;,2:Follow software theme styles

var currentNoteId;
var themeStyle = getComputedStyle(document.documentElement).getPropertyValue('--theme-style');
var editor = 'https://embed.diagrams.net/?embed=1&ui=min&spin=1&proto=json&configure=1&libraries=1&noSaveBtn=1&math=1';
var id_svg_dict = {}
var activeReceiveListeners = {}; // keyed by noteId — supports multiple simultaneous editors


function edit(noteId) {
  const editingNoteId = noteId;
  const $wrapper = $('div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper');

  // Guard: if editor already open in this specific pane, don't add another one
  if ($wrapper.find('div.iframe-drawio').length > 0) {
    return;
  }

  // Kill any stray fullscreen editor
  if ($('body > div.iframe-drawio').length > 0) {
    $('body > div.iframe-drawio').remove();
  }

	$('div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component div.note-detail-image-wrapper').off("click");

	var svg = id_svg_dict[noteId];
	$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper .note-detail-image-view").css("display", "none");
	var div_iframe = document.createElement('div');
	div_iframe.classList.add("iframe-drawio");
	var iframe = document.createElement('iframe');
	iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'clipboard-write');
	if (themeStyle.indexOf('dark') >= 0 && defaultTheme != 0) { div_iframe.classList.add("dark"); }
	iframe.setAttribute('src', editor);
	document.querySelector('div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper').appendChild(div_iframe);

	div_iframe.appendChild(iframe);
	$('div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio').prepend(`<div class="drawio-iframe" style=" position: absolute; border-radius: 5px; color:#837d7d; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 11%), inset 0 -1px 0 0 rgb(0 0 0 / 8%), 0 1px 2px 0 rgb(0 0 0 / 4%);
 right: 8px; top: 8px;  padding: 0px 4px; ">
<div class="drawio-switch-theme bx" title="Drawio Switch Theme" style="cursor: pointer; padding: 6px;"></div>
<div class="drawio-switch-full-screen bx" title="Drawio Switch Full Screen" style=" cursor: pointer; padding: 6px;">
</div><div class="drawio-save-and-close bx" title="Drawio Close and Exit" style=" cursor: pointer; padding: 6px;">
</div></div>`);
	$('div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio .drawio-switch-theme.bx').click(function (event) {
		event.stopPropagation();
		var $iframe_tmp = $("div.component.note-split:not(.hidden-ext) div.note-detail-image-wrapper div.iframe-drawio");
		if ($iframe_tmp.length > 0) {
			if ($iframe_tmp.hasClass("dark")) { $iframe_tmp.removeClass("dark"); }
			else { $iframe_tmp.addClass("dark"); }
		}
		else {
			const $iframe_tmp = $("body > div.iframe-drawio");
			if ($iframe_tmp.hasClass("dark")) { $iframe_tmp.removeClass("dark"); }
			else { $iframe_tmp.addClass("dark"); }
		}
	});
	$('div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio .drawio-switch-full-screen.bx').click(function (event) {
		event.stopPropagation();
		const $iframe_tmp = $("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio");
		if ($iframe_tmp.length > 0) {
			$iframe_tmp.appendTo($(parent.document).find("body"));
			$iframe_tmp.css("position", "fixed");
			$(".tab-row-filler").css("-webkit-app-region", "none");
		}
		else {
			const $iframe_tmp = $("body > div.iframe-drawio");
			$iframe_tmp.appendTo($("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper"));
			$iframe_tmp.css("position", "");
			$(".tab-row-filler").css("-webkit-app-region", "drag");
		}
	});
	$('div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio .drawio-save-and-close.bx').click(function (event) {
		event.stopPropagation();
		close();
	})

	var close = function () {
		id_svg_dict[noteId] = svg;
		window.removeEventListener('message', receive);
		delete activeReceiveListeners[noteId];
		if ($("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio").length > 0) {
			$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio").remove();
		}
		else {
			$("body > div.iframe-drawio").remove();
			$(".tab-row-filler").css("-webkit-app-region", "drag");
		}
		$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper img.note-detail-image-view").css("display", "block");
		var img = $("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper img.note-detail-image-view");
		img.attr("src", img.attr("src"));
		$('div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component div.note-detail-image-wrapper').click(noteId, function () {
			edit(noteId);
		});
	};

	var receive = function (evt) {
		if (editingNoteId != currentNoteId || div_iframe == undefined || iframe.contentWindow == null) { return; }
		if (evt.data.length > 0) {
			var msg = JSON.parse(evt.data);
			if (msg.event == 'configure') {
				iframe.contentWindow.postMessage(JSON.stringify({
					action: 'configure',
					config: { defaultFonts: ["Helvetica", "Verdana", "Times New Roman", "SimSun"], css: " " }
				}), '*');
			}
			else if (msg.event == 'init') {
				iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', autosave: 1, xml: svg, saveAndExit: '0', noExitBtn: '1' }), '*');
			}
			else if (msg.event == 'export') {
				var base64String = msg.data.substring(msg.data.indexOf(',') + 1);
				const bytes = new Uint8Array(atob(base64String).split('').map(c => c.charCodeAt(0)));
				const decoder = new TextDecoder('utf-8');
				const decodedString = decoder.decode(bytes);
				svg = decodedString;
				id_svg_dict[noteId] = svg;
				api.runAsyncOnBackendWithManualTransactionHandling(async (noteId, svg) => {
					const note = await api.getNote(noteId);
					note.setContent(svg);
				}, [noteId, svg]);
			}
			else if (msg.event == 'autosave') {
				iframe.contentWindow.postMessage(JSON.stringify({
					action: 'export',
					format: 'xmlsvg', spin: 'Updating page',
				}), '*');
			}
			else if (msg.event == 'save') {
				iframe.contentWindow.postMessage(JSON.stringify({
					action: 'export',
					format: 'xmlsvg', spin: 'Updating page'
				}), '*');
			}
			else if (msg.event == 'exit') {
				close();
			}
		}
	};

	if (activeReceiveListeners[noteId]) { window.removeEventListener('message', activeReceiveListeners[noteId]); }
	activeReceiveListeners[noteId] = receive;
	window.addEventListener('message', receive);
};


function addClick(noteId, autoEdit) {
  const $wrapper = $('div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component div.note-detail-image-wrapper');
  const $img = $('div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component img.note-detail-image-view');

  $wrapper.off("click.drawio");
  $wrapper.on("click.drawio", function () { edit(noteId); });

  if (themeStyle.indexOf('dark') >= 0) {
    $img.addClass('dark');
  } else if (themeStyle.indexOf('light') >= 0) {
    $img.addClass('light');
  }

  if (autoEdit) {
    edit(noteId);
  }
}


class DrawiIo extends api.NoteContextAwareWidget {
	get position() { return 100; }
	static get parentWidget() { return 'center-pane'; }

	doRender() {
		this.$widget = $(`<style type="text/css">
        div.iframe-drawio {
            width: 100%;
            height: 100%;
        }
        div.component.note-detail.component img.note-detail-image-view {
            filter: var(--drawio-preview-filter, none);
        }
        img.note-detail-image-view {
            transform: none !important;
            width: max-content;
            max-width: 100%;
            height: max-content;
            max-height: 100%;
        }
        img.note-detail-image-view.dark {
            filter: invert(88%) hue-rotate(180deg);
        }
        iframe { z-index: 100; }
        div.iframe-drawio.dark { filter: invert(88%) hue-rotate(180deg); }
        .iframe-drawio iframe {
            border: 0; right: 0; bottom: 0; width: 100%; height: 100%;
        }
        div.iframe-drawio {
            z-index: 100; border: 0; right: 0; bottom: 0; width: 100%; height: 100%;
        }
        .drawio-switch-theme.bx::before { content: "\\ec34"; }
        .drawio-switch-full-screen.bx::before { content: "\\eaeb"; }
        .drawio-save-and-close.bx::before { content: "\\ec8d"; }
</style>`);
		return this.$widget;
	}

	async refreshWithNote(note) {
		var noteId = note.noteId;
		currentNoteId = noteId;
		var autoEdit = false;

		// Tear down any stale editor scoped to the pane that is transitioning to this note.
		// Checks each editor individually — leaves editors in other (background) tabs untouched.
		$("div.note-detail-image-wrapper div.iframe-drawio").each(function () {
			var $editorPane = $(this).closest("div.component.note-split");
			// Only remove if this pane is currently the active (visible) one
			// AND it does not already belong to the note we're navigating TO.
			var paneIsActive = $editorPane.is(":not(.hidden-ext)");
			var paneAlreadyShowsThisNote = $editorPane.find("img.note-detail-image-view[src*='" + noteId + "']").length > 0;
			if (paneIsActive && !paneAlreadyShowsThisNote) {
				$(this).remove();
				$editorPane.find(".note-detail-image-wrapper img.note-detail-image-view").css("display", "block");
			}
		});
		// Fullscreen editor escaped to body — always safe to remove
		if ($("body > div.iframe-drawio").length > 0) {
			$("body > div.iframe-drawio").remove();
			$(".tab-row-filler").css("-webkit-app-region", "drag");
		}

		id_svg_dict[noteId] = (await note.getNoteComplement()).content;
		if (note.hasLabel("originalFileName") && note.getLabel("originalFileName").value == "drawio.svg" && (await note.getNoteComplement()).content == undefined) {
			id_svg_dict[noteId] = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="1px" height="1px" viewBox="-0.5 -0.5 1 1" content="&lt;mxfile host=&quot;app.diagrams.net&quot; modified=&quot;2023-04-29T09:11:12.196Z&quot; agent=&quot;Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0&quot; etag=&quot;fO2zVAtDBdoeKHVc3k6l&quot; version=&quot;21.2.3&quot;&gt;&#xA;  &lt;diagram name=&quot;Page-1&quot; id=&quot;mQcrQwb1aOjnsej_quHy&quot;&gt;&#xA;    &lt;mxGraphModel dx=&quot;1238&quot; dy=&quot;773&quot; grid=&quot;1&quot; gridSize=&quot;10&quot; guides=&quot;1&quot; tooltips=&quot;1&quot; connect=&quot;1&quot; arrows=&quot;1&quot; fold=&quot;1&quot; page=&quot;1&quot; pageScale=&quot;1&quot; pageWidth=&quot;827&quot; pageHeight=&quot;1169&quot; math=&quot;0&quot; shadow=&quot;0&quot;&gt;&#xA;      &lt;root&gt;&#xA;        &lt;mxCell id=&quot;0&quot; /&gt;&#xA;        &lt;mxCell id=&quot;1&quot; parent=&quot;0&quot; /&gt;&#xA;      &lt;/root&gt;&#xA;    &lt;/mxGraphModel&gt;&#xA;  &lt;/diagram&gt;&#xA;&lt;/mxfile&gt;&#xA;" resource="https://app.diagrams.net/?src=about#"><defs/><g/></svg>`;
			note.mime = "image/svg+xml";
			autoEdit = true;
			api.runAsyncOnBackendWithManualTransactionHandling(async (NoteId, svg) => {
				const Note = await api.getNote(NoteId);
				Note.setContent(svg);
				Note.mime = "image/svg+xml";
				Note.title = Note.title + ".drawio.svg"
				Note.save();
			}, [noteId, id_svg_dict[noteId]]);
		}

		$(document).ready(() => {
			// ischangeTab: true when this pane is already showing this note (tab switch, not navigation)
			var ischangeTab = (this.noteId === noteId);

			if (!ischangeTab) {
				if ($("div.component.note-split:not(.hidden-ext) div.note-detail-image-wrapper div.iframe-drawio").length > 0) {
					$("div.component.note-split:not(.hidden-ext) div.note-detail-image-wrapper div.iframe-drawio").remove();
				}
				if ($("div.component.note-split:not(.hidden-ext) .note-detail-printable.component div.note-detail-image-wrapper img.note-detail-image-view").length > 0) {
					$("div.component.note-split:not(.hidden-ext) .note-detail-printable.component div.note-detail-image-wrapper img.note-detail-image-view").css("display", "block");
				}
				$('div.component.note-split:not(.hidden-ext) .note-detail-printable.component .note-detail-image-wrapper').off("click");
				var $imgClean = $('div.component.note-split:not(.hidden-ext) .note-detail-printable.component img.note-detail-image-view');
				if ($imgClean.length > 0) {
					if ($imgClean.hasClass('dark')) { $imgClean.removeClass('dark'); }
					if ($imgClean.hasClass('light')) { $imgClean.removeClass('light'); }
				}
			}

			if (note.mime != "image/svg+xml" || id_svg_dict[noteId].indexOf("mxfile") < 0) { return; }

			// Trigger ribbon render before polling
			$("div.ribbon-tab-title.active").click();

			// Poll until the img element exists in the DOM, then bind
			var pollCount = 0;
			var pollForImg = setInterval(function () {
				pollCount++;
				if (pollCount > 30) { clearInterval(pollForImg); return; }
				// If an editor iframe is already open in this pane, don't interfere
				if ($("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio").length > 0) {
					clearInterval(pollForImg);
					return;
				}
				var $img = $("div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component img.note-detail-image-view");
				if ($img.length > 0) {
					clearInterval(pollForImg);
					// Ensure the img is visible — may have been hidden by a prior editor session
					$img.css("display", "block");
					// Cache-bust src to force a fresh render
					var src = $img.attr("src");
					if (src) { $img.attr("src", src + (src.indexOf('?') >= 0 ? '&' : '?') + '_r=' + Date.now()); }
					addClick(noteId, autoEdit);
				}
			}, 100);
		});
	}

	async entitiesReloadedEvent({ loadResults }) {
		if (loadResults.isNoteContentReloaded(this.noteId)) {
			this.refresh();
		}
	}
}

module.exports = DrawiIo;

window.onbeforeunload = function () {
	if ($("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio").length > 0) {
		$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper div.iframe-drawio").remove();
	}
	else {
		$("body > div.iframe-drawio").remove();
		$(".tab-row-filler").css("-webkit-app-region", "drag");
	}
};
