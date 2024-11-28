import { RecordingEvent, RecordingEventType } from "@contentsquare/recording-events";

type VNodeId = number;

interface VAttr {
  name: string;
  value: string;
  namespaceURI: string;
}

interface Cursor {
  x: number;
  y: number;
  isPressed?: boolean;
  hover?: VNodeId;
}

interface VStyleSheet {
  id: number;
  cssRules: [];
}

interface StyleSheets {
  [id: number]: VStyleSheet;
}

interface VNode {
  id: VNodeId;
  nodeType: string;
  localName?: string;
  namespaceURI?: string;
  data?: string;
  parentId?: VNodeId;
  shadowRoot?: VNodeId;
  attributes?: VAttr[];
  children?: VNodeId[];
  adoptedStylesheets?: number[];
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
  scrollTop?: number;
  scrollLeft?: number;
}

interface Touch {
  id: number;
  x: number;
  y: number;
}

type SerializedNode = any;

interface Nodes {
  [id: VNodeId]: VNode;
}

function serializedToVnode({ csId, children, shadowRoot, contentDocument, attributes, ...props }: SerializedNode, parentId?: VNodeId): VNode {
  return {
    id: csId,
    parentId,
    contentDocument: contentDocument?.csId,
    shadowRoot: shadowRoot?.csId,
    attributes: attributes?.reduce((acc, { name, value }) => ({ ...acc, [name]: value }), {}),
    children: children?.map(child => child.csId),
    ...props,
  };
}

function *visitNode(node: SerializedNode, parentId?: VNodeId): Generator<VNode> {
  yield serializedToVnode(node, parentId);
  for (const child of node.children || [])
    yield* visitNode(child, node.parentId);
  if (node.shadowRoot)
    yield* visitNode(node.shadowRoot, node.parentId);
  if (node.contentDocument)
    yield* visitNode(node.contentDocument, node.parentId);
}

function Event(eventType: RecordingEventType) {
  return (target: any, method: any) => {
    const Klass = target.constructor;
    const events = Klass.__events || {};
    events[eventType] = method;
    Klass.__events = events;
  };
}

export class VirtualDOM {
  private nodes: Nodes = {};
  private customElements: string[] = [];
  private stylesheets: StyleSheets = {};
  private cursor: Cursor | undefined;
  private touches: Touch[] = [];
  private rootId: number | undefined;

  private isDirty = false;

  constructor() {}

  getNodes() {
    return this.nodes;
  }

  getNode(id: VNodeId) {
    this.isDirty = true;
    this.nodes[id] = { ...this.nodes[id] };
    return this.nodes[id];
  }

  getStylesheet(id: number) {
    return this.stylesheets[id];
  }

  getCustomElements() {
    return this.customElements;
  }

  getRootId() {
    return this.rootId || null;
  }

  getCursor() {
    return this.cursor;
  }

  getTouches() {
    return this.touches;
  }

  clear() {
    this.nodes = {};
    this.customElements = [];
    this.stylesheets = {};
    this.cursor = undefined;
    this.touches = [];
    this.rootId = undefined;
  }

  @Event(RecordingEventType.INITIAL_DOM)
  initialDOM(serializedNode: SerializedNode) {
    this.nodes = {}; // remove all existing nodes
    this.registerNodes(serializedNode);
    this.rootId = serializedNode.csId;
  }

  @Event(RecordingEventType.MUTATION_INSERT)
  mutationInsert(parentId: number, nextSibling: number, serializedNode: SerializedNode) {
    this.registerNodes(serializedNode, parentId);
    const parent = this.getNode(parentId);
    const siblings = parent.children || [];
    const index = siblings.indexOf(nextSibling);
    if (index > -1) {
      const prevSiblings = siblings!.slice(0, index);
      const nextSiblings = siblings!.slice(index);
      parent.children = [...prevSiblings, serializedNode.csId, ...nextSiblings];
    } else {
      parent.children = [...siblings, serializedNode.csId];
    }
  }

  @Event(RecordingEventType.MUTATION_MOVE)
  mutationMove(nodeId: number, nextSibling: number, parentId: number) {
    const node = this.getNode(nodeId);
    this.detachNode(node);
    
  }

  @Event(RecordingEventType.MUTATION_REMOVE)
  mutationRemove(nodeId: number) {
    const node = this.getNode(nodeId);
    this.detachNode(node);
    // TODO: remove the node from the store
  }

  private detachNode(node: VNode) {
    const parentId = node.parentId;
    if (parentId) {
      const parent = this.getNode(parentId);
      parent.children = parent.children?.filter(c => c !== node.id);
    }
  }

  @Event(RecordingEventType.MUTATION_CHARACTER_DATA)
  mutationCharacterData(nodeId: number, data: string) {
    const node = this.getNode(nodeId);
    node.data = data;
  }

  @Event(RecordingEventType.ATTACH_SHADOW)
  attachShadow(nodeId: number, serializedShadow: SerializedNode) {
    const node = this.getNode(nodeId);
    this.registerNodes(serializedShadow, nodeId);
    node.shadowRoot = serializedShadow.csId;
  }

  @Event(RecordingEventType.INPUT_TEXT)
  inputText(nodeId: number, text: string) {
    const node = this.getNode(nodeId);
    node.value = text;
  }

  @Event(RecordingEventType.INPUT_CHECKABLE)
  inputCheck(nodeId: number, checked: boolean) {
    const node = this.getNode(nodeId);
    node.checked = checked;
  }

  @Event(RecordingEventType.INPUT_SELECT)
  inputSelect(nodeId: number, selectedIndex: number) {
    const node = this.getNode(nodeId);
    node.selectedIndex = selectedIndex;
  }

  @Event(RecordingEventType.SCROLL)
  scroll(nodeId: number, left: number, top: number) {
    const node = this.getNode(nodeId);
    node.scrollTop = top;
    node.scrollLeft = left;
  }

  @Event(RecordingEventType.MOUSE_DOWN)
  mouseDown() {
    this.cursor = { x: 0, y: 0, ...this.cursor, isPressed: true };
  }

  @Event(RecordingEventType.MOUSE_UP)
  mouseUp() {
    this.cursor = { x: 0, y: 0, ...this.cursor, isPressed: false };
  }

  @Event(RecordingEventType.MOUSE_OVER)
  mouseOver(nodeId: number) {
    this.cursor = { x: 0, y: 0, ...this.cursor, hover: nodeId };
  }

  @Event(RecordingEventType.MOUSE_MOVE)
  mouseMove(x: number, y: number) {
    this.cursor = { ...this.cursor, x, y };
  }

  @Event(RecordingEventType.TOUCH_START)
  touchStart(fingerId: number, x: number, y: number) {
    this.touches = [...this.touches, { id: fingerId, x, y }];
  }

  @Event(RecordingEventType.TOUCH_MOVE)
  touchMove(fingerId: number, x: number, y: number) {
    const index = this.touches.findIndex((touch) => touch.id === fingerId);
    this.touches[index] = {
      ...this.touches[index],
      x,
      y,
    };
    this.touches = [...this.touches];
  }

  @Event(RecordingEventType.TOUCH_END)
  @Event(RecordingEventType.TOUCH_CANCEL)
  touchEnd(fingerId: number) {
    this.touches = this.touches.filter(touch => touch.id !== fingerId);
  }

  @Event(RecordingEventType.CUSTOM_ELEMENT_REGISTRATION)
  customElementRegistration(localName: string) {
    this.customElements = [...this.customElements, localName];
  }

  apply(events: RecordingEvent[]) {
    this.isDirty = false;
    for (const event of events) {
      const method = getMethodName(event.type);
      if (method)
        (this[method] as any)(...event.args);
    }
    if (this.isDirty)
      this.nodes = { ...this.nodes };
  }

  private registerNodes(root: SerializedNode, parentId?: VNodeId) {
    for (const node of visitNode(root, parentId))
      this.nodes[node.id] = node;
  }
  // ... handle all other event 
}

function getMethodName(eventType: RecordingEventType): keyof VirtualDOM | undefined {
  return (VirtualDOM as any).__events[eventType];
}