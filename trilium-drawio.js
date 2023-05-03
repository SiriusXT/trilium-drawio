/*
trilium-drawio
https://github.com/SiriusXT/trilium-drawio
version:0.2
*/

var currentNoteId;
var themeStyle = getComputedStyle(document.documentElement).getPropertyValue('--theme-style');
var last_image_wrapper;
var editor = 'https://embed.diagrams.net/?embed=1&ui=min&spin=1&proto=json&configure=1';
var id_svg_dict={}
function  fullScreen (){
    const $iframe=$("div.component.note-split:not(.hidden-ext) iframe");
    if ($iframe.length>0){
    $iframe.appendTo($(parent.document).find("body"));
    $iframe.css("position","fixed"); }  
    else {
    const $iframe=$("body > iframe");
        $("iframe").appendTo($("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper"));
        $iframe.css("position","static"); 
    }
        
}
function edit(noteId) {
    var svg=id_svg_dict[noteId];
	$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper .note-detail-image-view").css("display", "none");
	var iframe = document.createElement('iframe');
	iframe.setAttribute('frameborder', '0');

	if (themeStyle.indexOf('dark') >= 0) { iframe.setAttribute('class', 'dark'); }


	var close = function () {
        id_svg_dict[noteId]=svg;
		window.removeEventListener('message', receive);
		$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper iframe").remove();
		$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper img.note-detail-image-view").css("display", "block");
        const decodedString=svg;
        const utf8Array = new TextEncoder().encode(decodedString); 
const base64String = btoa(String.fromCharCode(...utf8Array)); 
		var base64 = "data:image/svg+xml;base64," + base64String;
		$("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper img.note-detail-image-view").attr("src", base64);
	};
	var receive = function (evt) {
		if (noteId != currentNoteId || iframe == undefined) { return; }
		if (evt.data.length > 0) {
			var msg = JSON.parse(evt.data);

			// If configure=1 URL parameter is used the application
			// waits for this message. For configuration options see
			// https://desk.draw.io/support/solutions/articles/16000058316
			if (msg.event == 'configure') {
				iframe.contentWindow.postMessage(JSON.stringify({
					action: 'configure',
					config: { defaultFonts: ["Helvetica", "Verdana", "Times New Roman","SimSun"], css: "div[style='display: inline-flex; align-items: center; margin-left: auto;'] button:nth-of-type(2n+1) {display: none;} body.geEditor > div.mxWindow:nth-of-type(3) { right: 0px !important; top:63px !important;   left: unset !important;} body.geEditor > div.mxWindow:nth-of-type(2) { left: 17px !important; top:63px !important;  " }
				}), '*');
			}
			else if (msg.event == 'init') {
				iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', autosave: 1, xml: svg, saveAndExit: '1' }), '*');
			}
			else if (msg.event == 'export') {
				// Extracts SVG DOM from data URI to enable links
				//svg = atob(msg.data.substring(msg.data.indexOf(',') + 1));
                var base64String=msg.data.substring(msg.data.indexOf(',') + 1);
                const bytes = new Uint8Array(atob(base64String).split('').map(c => c.charCodeAt(0))); 
const decoder = new TextDecoder('utf-8'); 
const decodedString = decoder.decode(bytes); 
                svg=decodedString;
                id_svg_dict[noteId]=svg;
				api.runOnBackend(async (noteId, svg) => {
					const note = await api.getNote(noteId);
					note.setContent(svg);
				}, [noteId, svg]);
			}
			else if (msg.event == 'autosave') {
				iframe.contentWindow.postMessage(JSON.stringify({
					action: 'export',
					format: 'xmlsvg', xml: msg.xml, spin: 'Updating page'
				}), '*');

			}
			else if (msg.event == 'save') {

				iframe.contentWindow.postMessage(JSON.stringify({
					action: 'export',
					format: 'xmlsvg', xml: msg.xml, spin: 'Updating page'
				}), '*');
				close();
			}
			else if (msg.event == 'exit') {
				close();
			}
		}
	};

	iframe.setAttribute('src', editor);
	document.querySelector('div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper').appendChild(iframe);
    window.addEventListener('message', receive);
};

 
function addClick(noteId,autoEdit) {
	var $img = $('div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component img.note-detail-image-view');
	if (!$img.hasClass('dark') && !$img.hasClass('light')) {
		$('div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component div.note-detail-image-wrapper').off("click");
		$('div.component.note-split:not(.hidden-ext) div.component.scrolling-container div.note-detail.component div.note-detail-image-wrapper').click(noteId, function () {
			edit( noteId);
		});
	}
	if (themeStyle.indexOf('dark') >= 0) { $img.addClass('dark'); }
	else if (themeStyle.indexOf('light') >= 0) { $img.addClass('light'); }
    if (autoEdit){
        edit( noteId);
    }
}

class DrawiIo extends api.NoteContextAwareWidget {
	get position() {
		return 100;
	}
	get parentWidget() {
		return 'center-pane';
	}

	doRender() {
		this.$widget = $(`<style type="text/css">
        img.note-detail-image-view{        
            transform: none !important;
            width: max-content;
    max-width: 100%;
    height: max-content;
    max-height: 100%;
        }
        img.note-detail-image-view.light{
            transform: none !important;
        }
         img.note-detail-image-view.dark {
  filter: invert(88%) hue-rotate(180deg);
}
iframe{
  z-index: 100;
}
iframe.dark{
  filter: invert(88%) hue-rotate(180deg);
}
iframe {
			border:0;
			right:0;
			bottom:0;
			width:100%;
			height:100%
		}

</style>`);
		return this.$widget;
	}

	async refreshWithNote(note) {
		var noteId = note.noteId;
		currentNoteId = noteId;
        window.note=note;
        var autoEdit=false;
		id_svg_dict[noteId] = (await note.getNoteComplement()).content;
		if (note.hasLabel("originalFileName") && note.getLabel("originalFileName").value == "drawio.svg" && (await note.getNoteComplement()).content == undefined) {
			id_svg_dict[noteId] = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="1px" height="1px" viewBox="-0.5 -0.5 1 1" content="&lt;mxfile host=&quot;app.diagrams.net&quot; modified=&quot;2023-04-29T09:11:12.196Z&quot; agent=&quot;Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0&quot; etag=&quot;fO2zVAtDBdoeKHVc3k6l&quot; version=&quot;21.2.3&quot;&gt;&#xA;  &lt;diagram name=&quot;Page-1&quot; id=&quot;mQcrQwb1aOjnsej_quHy&quot;&gt;&#xA;    &lt;mxGraphModel dx=&quot;1238&quot; dy=&quot;773&quot; grid=&quot;1&quot; gridSize=&quot;10&quot; guides=&quot;1&quot; tooltips=&quot;1&quot; connect=&quot;1&quot; arrows=&quot;1&quot; fold=&quot;1&quot; page=&quot;1&quot; pageScale=&quot;1&quot; pageWidth=&quot;827&quot; pageHeight=&quot;1169&quot; math=&quot;0&quot; shadow=&quot;0&quot;&gt;&#xA;      &lt;root&gt;&#xA;        &lt;mxCell id=&quot;0&quot; /&gt;&#xA;        &lt;mxCell id=&quot;1&quot; parent=&quot;0&quot; /&gt;&#xA;      &lt;/root&gt;&#xA;    &lt;/mxGraphModel&gt;&#xA;  &lt;/diagram&gt;&#xA;&lt;/mxfile&gt;&#xA;" resource="https://app.diagrams.net/?src=about#"><defs/><g/></svg>`;
			note.mime = "image/svg+xml";
            autoEdit=true;
			api.runOnBackend(async (NoteId, svg) => {
				const Note = await api.getNote(NoteId);
				Note.setContent(svg);
				Note.mime = "image/svg+xml";
				Note.title = Note.title + ".drawio"
				Note.save();
			}, [noteId, id_svg_dict[noteId]]);
		}

		$(document).ready(function () {
			var ischangeTab = false;
			if (last_image_wrapper != undefined && last_image_wrapper.length > 0) {
				window.last_image_wrapper = last_image_wrapper;
				$.each(last_image_wrapper.parents(), function (index, value) {
					var truecount = 0;
					$.each(value.classList, function (index1, classL) {
						if (classL == "note-split") { truecount += 1; }
						else if (classL == "hidden-ext") { truecount += 1; }
					});
					if (truecount == 2) {
						ischangeTab = true;
					}

				});
			}
			last_image_wrapper = $("div.component.note-split:not(.hidden-ext) div.scrolling-container.component");// div.note-detail-image-wrapper
			if (!ischangeTab) {
				if ($("div.component.note-split:not(.hidden-ext) div.note-detail-image-wrapper iframe").length > 0) { $("div.component.note-split:not(.hidden-ext) div.note-detail-image-wrapper iframe").remove(); }
				if ($("div.component.note-split:not(.hidden-ext) .note-detail-printable.component div.note-detail-image-wrapper img.note-detail-image-view").length > 0) { $("div.component.note-split:not(.hidden-ext) .note-detail-printable.component div.note-detail-image-wrapper img.note-detail-image-view").css("display", "block"); }
				$('div.component.note-split:not(.hidden-ext) .note-detail-printable.component .note-detail-image-wrapper').off("click");
				var $img = $('div.component.note-split:not(.hidden-ext) .note-detail-printable.component img.note-detail-image-view');
				if ($img.length > 0) {
					if ($img.hasClass('dark')) { $img.removeClass('dark') }
					if ($img.hasClass('light')) { $img.removeClass('light') }
				}
			}
			if (note.mime != "image/svg+xml" || id_svg_dict[noteId].indexOf("mxfile") < 0) { return; }
			setTimeout(function () {
				if ($("div.component.note-split:not(.hidden-ext) .note-detail-image-wrapper iframe").length > 0) { return; };//When switching tabs, if the iframe is already loaded, return

				addClick(noteId,autoEdit);
			}, 10);
			$("div.ribbon-tab-title.active").click();
		});

	}
}

module.exports = new DrawiIo();
