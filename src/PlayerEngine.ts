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
  attributes?: { [name: string]: string }; // TODO: do something to handle namespace
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
    yield* visitNode(child, node.csId);
  if (node.shadowRoot)
    yield* visitNode(node.shadowRoot, node.csId);
  if (node.contentDocument)
    yield* visitNode(node.contentDocument, node.csId);
}

function Play(eventType: RecordingEventType) {
  return (target: any, method: any) => {
    const Klass = target.constructor;
    const events = Klass.__events || {};
    events[eventType] = method;
    Klass.__events = events;
  };
}

export interface VirtualDOM {
  nodes: Nodes;
  customElements: string[];
  stylesheets: StyleSheets;
  cursor: Cursor | undefined;
  touches: Touch[];
  rootId: number | undefined;
}

export function createVirtualDOM(): VirtualDOM {
  return {
    nodes: {},
    customElements: [],
    stylesheets: {},
    cursor: undefined,
    touches: [],
    rootId: undefined
  };
}

export class PlaybackEngine {
  private state: VirtualDOM = createVirtualDOM();
  private nodeDirty = false;

  constructor() {}

  private get nodes() {
    return this.state.nodes;
  }
  private set nodes(nodes: Nodes) {
    this.state = { ...this.state, nodes };
  }

  private get stylesheets() {
    return this.state.stylesheets;
  }
  private set stylesheets(stylesheets: StyleSheets) {
    this.state = { ...this.state, stylesheets };
  }

  private get customElements() {
    return this.state.customElements;
  }
  private set customElements(customElements: string[]) {
    this.state = { ...this.state, customElements };
  }

  private get cursor() {
    return this.state.cursor;
  }
  private set cursor(cursor: Cursor | undefined) {
    this.state = { ...this.state, cursor };
  }

  private get touches() {
    return this.state.touches;
  }
  private set touches(touches: Touch[]) {
    this.state = { ...this.state, touches };
  }

  private get rootId() {
    return this.state.rootId;
  }
  private set rootId(rootId: VNodeId | undefined) {
    this.state = { ...this.state, rootId };
  }

  getVirtualDOM() {
    return this.state;
  }

  getNode(id: VNodeId) {
    // when accessing to a node we make sure the nodes will be recreated
    this.nodeDirty = true;
    return (this.nodes[id] = { ...this.nodes[id] });
  }

  getStylesheet(id: number) {
    return this.stylesheets[id];
  }

  clear() {
    this.state = createVirtualDOM();
    return this;
  }

  @Play(RecordingEventType.INITIAL_DOM)
  initialDOM(serializedNode: SerializedNode) {
    // TODO: not sure if I have to call the clear method here
    this.nodes = {}; // remove all existing nodes
    this.registerNodes(serializedNode);
    this.rootId = serializedNode.csId;
  }

  @Play(RecordingEventType.MUTATION_INSERT)
  mutationInsert(parentId: number, nextSibling: number, serializedNode: SerializedNode) {
    this.registerNodes(serializedNode);
    const node = this.getNode(serializedNode.csId);
    this.insertBefore(node, parentId, nextSibling);
  }

  @Play(RecordingEventType.MUTATION_MOVE)
  mutationMove(nodeId: number, nextSibling: number, parentId: number) {
    const node = this.getNode(nodeId);
    this.insertBefore(node, parentId, nextSibling);
  }

  @Play(RecordingEventType.MUTATION_REMOVE)
  mutationRemove(nodeId: number) {
    const node = this.getNode(nodeId);
    this.detachNode(node);
    // TODO: remove the node from the store
  }

  @Play(RecordingEventType.MUTATION_CHARACTER_DATA)
  mutationCharacterData(nodeId: number, data: string) {
    const node = this.getNode(nodeId);
    node.data = data;
  }

  @Play(RecordingEventType.MUTATION_ATTRIBUTE)
  mutationAttribute(nodeId: number, _attrNamespace: string, attrName: string, attrValue: string) {
    // TODO: handle namespaceURI
    const node = this.getNode(nodeId);
    if (attrValue === null || attrValue === undefined) {
      node.attributes = { ...node.attributes };
      delete node.attributes[attrName];
    } else {
      node.attributes = { ...node.attributes, [attrName]: attrValue };
    }
  }

  @Play(RecordingEventType.ATTACH_SHADOW)
  attachShadow(nodeId: number, serializedShadow: SerializedNode) {
    const node = this.getNode(nodeId);
    this.registerNodes(serializedShadow, nodeId);
    node.shadowRoot = serializedShadow.csId;
  }

  @Play(RecordingEventType.INPUT_TEXT)
  inputText(nodeId: number, text: string) {
    const node = this.getNode(nodeId);
    node.value = text;
  }

  @Play(RecordingEventType.INPUT_CHECKABLE)
  inputCheck(nodeId: number, checked: boolean) {
    const node = this.getNode(nodeId);
    node.checked = checked;
  }

  @Play(RecordingEventType.INPUT_SELECT)
  inputSelect(nodeId: number, selectedIndex: number) {
    const node = this.getNode(nodeId);
    node.selectedIndex = selectedIndex;
  }

  @Play(RecordingEventType.SCROLL)
  scroll(nodeId: number, left: number, top: number) {
    const node = this.getNode(nodeId);
    node.scrollTop = top;
    node.scrollLeft = left;
  }

  @Play(RecordingEventType.MOUSE_DOWN)
  mouseDown() {
    this.cursor = { x: 0, y: 0, ...this.cursor, isPressed: true };
  }

  @Play(RecordingEventType.MOUSE_UP)
  mouseUp() {
    this.cursor = { x: 0, y: 0, ...this.cursor, isPressed: false };
  }

  @Play(RecordingEventType.MOUSE_OVER)
  mouseOver(nodeId: number) {
    this.cursor = { x: 0, y: 0, ...this.cursor, hover: nodeId };
  }

  @Play(RecordingEventType.MOUSE_MOVE)
  mouseMove(x: number, y: number) {
    this.cursor = { ...this.cursor, x, y };
  }

  @Play(RecordingEventType.TOUCH_START)
  touchStart(fingerId: number, x: number, y: number) {
    this.touches = [...this.touches, { id: fingerId, x, y }];
  }

  @Play(RecordingEventType.TOUCH_MOVE)
  touchMove(fingerId: number, x: number, y: number) {
    const index = this.touches.findIndex((touch) => touch.id === fingerId);
    this.touches[index] = {
      ...this.touches[index],
      x,
      y,
    };
    this.touches = [...this.touches];
  }

  @Play(RecordingEventType.TOUCH_END)
  @Play(RecordingEventType.TOUCH_CANCEL)
  touchEnd(fingerId: number) {
    this.touches = this.touches.filter(touch => touch.id !== fingerId);
  }

  @Play(RecordingEventType.CUSTOM_ELEMENT_REGISTRATION)
  customElementRegistration(localName: string) {
    this.customElements = [...this.customElements, localName];
  }

  // TODO: handle all other events

  apply(events: RecordingEvent[]) {
    for (const event of events) {
      const method = getMethodName(event.type);
      if (method)
        (this[method] as any)(...event.args);
    }
    if (this.nodeDirty) {
      this.nodes = Object.assign({}, this.nodes);
      this.nodeDirty = false;
    }
    return this;
  }

  private insertBefore(node: VNode, parentId: VNodeId, nextSibling?: VNodeId) {
    if (node.parentId)
      this.detachNode(node);
    node.parentId = parentId;
    const parent = this.getNode(parentId);
    const siblings = parent.children || [];
    const index = nextSibling ? siblings.indexOf(nextSibling) : -1;
    if (index > -1) {
      const prevSiblings = siblings!.slice(0, index);
      const nextSiblings = siblings!.slice(index);
      parent.children = [...prevSiblings, node.id, ...nextSiblings];
    } else {
      parent.children = [...siblings, node.id];
    }
  }

  private detachNode(node: VNode) {
    const parentId = node.parentId;
    if (parentId) {
      const parent = this.getNode(parentId);
      parent.children = parent.children?.filter(c => c !== node.id);
      node.parentId = undefined;
    }
  }

  private registerNodes(root: SerializedNode, parentId?: VNodeId) {
    for (const node of visitNode(root, parentId))
      this.nodes[node.id] = node;
  }
}

function getMethodName(eventType: RecordingEventType): keyof VirtualDOM | undefined {
  return (PlaybackEngine as any).__events[eventType];
}