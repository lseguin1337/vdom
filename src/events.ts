import { RecordingEventType } from "@contentsquare/recording-events";

let nodeId = 1;

function createEvent(type: RecordingEventType, ...args: any[]) {
  return {
    type,
    args,
    date: 0,
  };
}

function attr(name: string, value: string, namespaceURI?: string) {
  return {
    name,
    value,
    namespaceURI
  };
}

function el(localName: string, attributes: (ReturnType<typeof attr>)[] = [], children: any[] = []) {
  return {
    csId: nodeId++,
    nodeType: Node.ELEMENT_NODE,
    localName,
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    attributes,
    children,
  };
}

function elIframe(attributes: (ReturnType<typeof attr>)[] = [], contentDocument: any) {
  return {
    ...el('iframe', attributes),
    contentDocument,
  };
}

function text(data: string) {
  return {
    csId: nodeId++,
    nodeType: Node.TEXT_NODE,
    data,
  };
}

function comment(data: string) {
  return {
    csId: nodeId++,
    nodeType: Node.COMMENT_NODE,
    data,
  };
}

function shadowRoot(...children: any[]) {
  return {
    csId: nodeId++,
    nodeType: Node.DOCUMENT_FRAGMENT_NODE,
    children
  };
}

const yoloComment = comment(' yolo ');
const firstText = text('Hello world');
const style = el('style', [], [text('section { background-color: #fff; }')])
const divContainer = el('div', [attr('data-href', 'tata')], [style, firstText, text('yolo'), yoloComment]);
const section = el('section', [attr('data-href-t', 'tata-t')], [divContainer]);

const nestedEl = el('div', [], [text('nested div')]);
const secondDom = el('div', [attr('class', 'second-dom')], [el('div', [], [el('div', [], [nestedEl])])]);

const initialDom = createEvent(RecordingEventType.INITIAL_DOM, section);
const resize = createEvent(RecordingEventType.RESIZE, 800, 500);
const mutation1 = createEvent(RecordingEventType.MUTATION_INSERT, divContainer.csId, yoloComment.csId, text("blablala"));
const mutation2 = createEvent(RecordingEventType.MUTATION_INSERT, divContainer.csId, yoloComment.csId, text("blablala 2"));
const mutation3 = createEvent(RecordingEventType.MUTATION_REMOVE, mutation1.args[2].csId);
const mutation4 = createEvent(RecordingEventType.MUTATION_CHARACTER_DATA, yoloComment.csId, ' yolo2 ');
const mutation5 = createEvent(RecordingEventType.MUTATION_MOVE, yoloComment.csId, firstText.csId, divContainer.csId);
const mutation6 = createEvent(RecordingEventType.MUTATION_ATTRIBUTE, divContainer.csId, null, 'data-href', 'the new attr value');
const mutation7 = createEvent(RecordingEventType.MUTATION_REMOVE, divContainer.csId);
const mutation8 = createEvent(RecordingEventType.INITIAL_DOM, secondDom);
const mutation9 = createEvent(RecordingEventType.ATTACH_SHADOW, nestedEl.csId, shadowRoot(text('bonjour')));
const mutation10 = createEvent(RecordingEventType.MUTATION_INSERT, secondDom.csId, undefined, elIframe([], section));

export const recordingEvents = [initialDom, resize, mutation1, mutation2, mutation3, mutation4, mutation5, mutation6, mutation7, mutation8, mutation9, mutation10];