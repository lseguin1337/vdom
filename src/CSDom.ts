import { RecordingEvent, RecordingEventType } from "@contentsquare/recording-events";

type VNodeId = string;

export interface VAttr {
  name: string;
  value: string;
  namespaceURI: string;
}

interface Cursor {
  x?: number;
  y?: number;
  isPressed?: boolean;
  hover?: VNodeId;
}

interface VStyleSheet {
  id: number;
  cssRules: [];
}

// TODO: split this type in Specialized Type
export interface VNode {
  id: VNodeId;
  context?: VNodeId;
  nodeType: string;
  localName?: string;
  namespaceURI?: string;
  data?: string;
  parentId?: VNodeId;
  shadowRoot?: VNode;
  contentDocument?: VNode;
  attributes?: VAttr[];
  children?: VNode[];
  adoptedStyleSheets?: VStyleSheet[];
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
  scrollTop?: number;
  scrollLeft?: number;
  qualifiedName?: string;
  publicId?: string;
  systemId?: string;
  isPaused?: boolean;
}

interface Touch {
  id: number;
  x: number;
  y: number;
}

type SerializedNode = any;

function Type(eventType: RecordingEventType) {
  return (target: any, method: any) => {
    const Klass = target.constructor;
    const events = Klass.__events || {};
    events[eventType] = method;
    Klass.__events = events;
  };
}

function createPropDecorator(name: string) {
  return (target: any, method: any, index: number) => {
    const Klass = target.constructor;
    Klass.__args = Klass.__args || {};
    Klass.__args[method] = Klass.__args[method] || [];
    const argsMap = Klass.__args[method];
    argsMap[index] = name;
  };
}

function RefId() {
  return createPropDecorator('nodeRefId');
}

function Ref() {
  return createPropDecorator('nodeRef');
}

function Node() {
  return createPropDecorator('node');
}

interface Size {
  width: number;
  height: number;
}

export interface VirtualDOM {
  document: VNode | undefined;
  customElements: Set<string>;
  cursor: Cursor | undefined;
  touches: Touch[];
  viewport: Size | undefined;
  screen: Size | undefined;
}

export function createVirtualDOM(): VirtualDOM {
  return {
    document: undefined,
    customElements: new Set(),
    viewport: undefined,
    screen: undefined,
    cursor: undefined,
    touches: [],
  };
}

export class CSDom {
  private nodes: { [key: string]: VNode } = {};
  private state: VirtualDOM = createVirtualDOM();
  private dirtyNodes = new Set<string>();

  constructor() {}

  getState() {
    this.dirtyNodes.clear();
    return this.state;
  }

  clear() {
    this.nodes = {};
    this.dirtyNodes.clear();
    this.state = createVirtualDOM();
    return this;
  }

  apply(events: RecordingEvent[]) {
    let isDirtyState = false;
    for (const event of events) {
      const method = this.getMethodInfo(event.type);
      if (method) {
        (this[method.name] as any)(...this.prepareArgs(method.args, event));
        isDirtyState = true;
      }
    }
    if (isDirtyState) {
      this.state = { ...this.state };
    }
    return this;
  }

  @Type(RecordingEventType.INITIAL_DOM)
  protected initialDOM(@Node() document: VNode) {
    document.parentId = document.context;
    if (document.parentId) {
      const parent = this.getNode(document.parentId);
      parent.contentDocument = document;
    } else {
      this.state.document = document;
    }
  }

  @Type(RecordingEventType.MUTATION_INSERT)
  protected mutationInsert(
    @RefId() parentId: VNodeId,
    @RefId() nextSiblingId: VNodeId | undefined,
    @Node() node: VNode,
  ) {
    this.insertBefore(node, parentId, nextSiblingId);
  }

  @Type(RecordingEventType.MUTATION_MOVE)
  protected mutationMove(
    @Ref() node: VNode,
    @RefId() nextSibling: VNodeId | undefined,
    @RefId() parentId: VNodeId,
  ) {
    this.insertBefore(node, parentId, nextSibling);
  }

  @Type(RecordingEventType.MUTATION_REMOVE)
  protected mutationRemove(@Ref() node: VNode) {
    this.detachNode(node);
    for (const curr of this.visitNode(node))
      delete this.nodes[curr.id];
  }

  @Type(RecordingEventType.MUTATION_CHARACTER_DATA)
  protected mutationCharacterData(@Ref() node: VNode, data: string) {
    node.data = data;
  }

  @Type(RecordingEventType.MUTATION_ATTRIBUTE)
  protected mutationAttribute(@Ref() node: VNode, attrNamespace: string, attrName: string, attrValue: string) {
    const attributes = node.attributes || [];
    const index = attributes.findIndex((attr) => !(attr.namespaceURI === attrNamespace && attr.name === attrName));
    if (attrValue === null || attrValue === undefined) {
      node.attributes = attributes.filter((_attr, i) => i !== index);
    } else if (index === -1) {
      node.attributes = [...attributes, { namespaceURI: attrNamespace, name: attrName, value: attrValue }];
    } else {
      attributes[index] = { namespaceURI: attrNamespace, name: attrName, value: attrValue };
      node.attributes = [...attributes];
    }
  }

  @Type(RecordingEventType.ATTACH_SHADOW)
  protected attachShadow(
    @Ref() parent: VNode,
    @Node() shadowRoot: VNode,
  ) {
    shadowRoot.parentId = parent.id;
    parent.shadowRoot = shadowRoot;
  }

  @Type(RecordingEventType.INPUT_TEXT)
  protected inputText(@Ref() node: VNode, text: string) {
    node.value = text;
  }

  @Type(RecordingEventType.INPUT_CHECKABLE)
  protected inputCheck(@Ref() node: VNode, checked: boolean) {
    node.checked = checked;
  }

  @Type(RecordingEventType.INPUT_SELECT)
  protected inputSelect(@Ref() node: VNode, selectedIndex: number) {
    node.selectedIndex = selectedIndex;
  }

  @Type(RecordingEventType.SCROLL)
  protected scroll(@Ref() node: VNode, left: number, top: number) {
    node.scrollTop = top;
    node.scrollLeft = left;
  }

  @Type(RecordingEventType.MOUSE_DOWN)
  protected mouseDown() {
    this.state.cursor = { ...this.state.cursor, isPressed: true };
  }

  @Type(RecordingEventType.MOUSE_UP)
  protected mouseUp() {
    this.state.cursor = { ...this.state.cursor, isPressed: false };
  }

  @Type(RecordingEventType.MOUSE_OVER)
  protected mouseOver(@RefId() nodeId: VNodeId) {
    this.state.cursor = { ...this.state.cursor, hover: nodeId };
  }

  @Type(RecordingEventType.MOUSE_MOVE)
  protected mouseMove(x: number, y: number) {
    this.state.cursor = { ...this.state.cursor, x, y };
  }

  @Type(RecordingEventType.TOUCH_START)
  protected touchStart(fingerId: number, x: number, y: number) {
    this.state.touches = [...this.state.touches, { id: fingerId, x, y }];
  }

  @Type(RecordingEventType.TOUCH_MOVE)
  protected touchMove(fingerId: number, x: number, y: number) {
    const index = this.state.touches.findIndex((touch) => touch.id === fingerId);
    this.state.touches[index] = {
      ...this.state.touches[index],
      x,
      y,
    };
    this.state.touches = [...this.state.touches];
  }

  @Type(RecordingEventType.TOUCH_END)
  @Type(RecordingEventType.TOUCH_CANCEL)
  protected touchEnd(fingerId: number) {
    this.state.touches = this.state.touches.filter(touch => touch.id !== fingerId);
  }

  @Type(RecordingEventType.CUSTOM_ELEMENT_REGISTRATION)
  protected customElementRegistration(localName: string) {
    this.state.customElements = new Set([...this.state.customElements, localName]);
  }

  @Type(RecordingEventType.RESIZE)
  protected resize(width: number, height: number) {
    this.state.viewport = { width, height };
  }

  @Type(RecordingEventType.ADOPTED_STYLESHEET_RULE_DELETE)
  protected adoptedStylesheetRuleDelete() {
    // TODO: implement me
  }

  @Type(RecordingEventType.ADOPTED_STYLESHEET_RULE_INSERT)
  protected adoptedStylesheetRuleInsert() {
    // TODO: implement me
  }

  @Type(RecordingEventType.ADOPTED_STYLESHEET_RULE_UPDATE)
  protected adoptedStylesheetRuleUpdate() {
    // TODO: implement me
  }

  @Type(RecordingEventType.HTML_MEDIA_ELEMENT_PAUSE)
  protected mediaElementPause(@Ref() node: VNode) {
    node.isPaused = true;
  }

  @Type(RecordingEventType.HTML_MEDIA_ELEMENT_PLAY)
  protected mediaElementPlay(@Ref() node: VNode) {
    node.isPaused = false;
  }

  // TODO: handle all other events

  private getNode(id: VNodeId) {
    this.markDirty(id);
    return this.nodes[id];
  }

  private prepareArgs(argsDef: string[], event: RecordingEvent) {
    if (!argsDef?.length) return event.args;
    if (argsDef[0] === 'event') return [event];
    return event.args.map((value, idx) => {
      switch (argsDef[idx]) {
        case 'nodeRefId':
          if (value === undefined || value === null)
            return undefined;
          return this.toVNodeId(value as number, event.context);
        case 'nodeRef':
          return this.getNode(this.toVNodeId(value as number, event.context));
        case 'node':
          return this.toVNode(value, event.context);
        default:
          return value;
      }
    });
  }

  private *visitNode(node: VNode): Generator<VNode> {
    yield node;
    for (const child of node.children || [])
      yield* this.visitNode(child);
    if (node.shadowRoot)
      yield* this.visitNode(node.shadowRoot);
    if (node.contentDocument)
      yield* this.visitNode(node.contentDocument);
  }

  private insertBefore(node: VNode, parentId: VNodeId, nextSibling?: VNodeId) {
    if (node.parentId)
      this.detachNode(node);
    node.parentId = parentId;
    const parent = this.getNode(parentId);
    const siblings = parent.children || [];
    const index = nextSibling ? siblings.findIndex(sibling => sibling.id === nextSibling) : -1;
    if (index > -1) {
      const prevSiblings = siblings!.slice(0, index);
      const nextSiblings = siblings!.slice(index);
      parent.children = [...prevSiblings, node, ...nextSiblings];
    } else {
      parent.children = [...siblings, node];
    }
  }

  private detachNode(node: VNode) {
    const parentId = node.parentId;
    if (parentId) {
      const parent = this.getNode(parentId);
      parent.children = parent.children?.filter(sibling => sibling.id !== node.id);
      node.parentId = undefined;
    }
  }

  private toVNodeId(id: number, context: string | undefined): VNodeId {
    return context ? `${context}/${id}` : `${id}`;
  }

  private toVNode({ csId, children, shadowRoot, contentDocument, attributes, ...props }: SerializedNode, context: VNodeId | undefined, parentId?: VNodeId): VNode {
    const id = this.toVNodeId(csId, context);
    const node: VNode = {
      id,
      children: children?.map((child: SerializedNode) => this.toVNode(child, context, id)),
      shadowRoot: shadowRoot && this.toVNode(shadowRoot, context, id),
      contentDocument: contentDocument && this.toVNode(contentDocument, id, id),
      attributes,
      parentId,
      context,
      ...props,
    };
    this.nodes[id] = node;
    this.dirtyNodes.add(id);
    return node;
  }

  private markDirty(id: VNodeId) {
    if (this.dirtyNodes.has(id)) return;
    const node = this.nodes[id] = { ...this.nodes[id] };
    this.dirtyNodes.add(id);
    if (node.parentId) {
      // make the parent dirty has well
      const parent = this.getNode(node.parentId);
      // update the child ref into the parent
      const siblings = parent.children!;
      const index = siblings.findIndex((child) => child.id === node.id);
      if (index !== -1) {
        siblings[index] = node;
        parent.children = [...siblings];
      } else if (parent.contentDocument?.id === node.id) {
        parent.contentDocument = node;
      } else if (parent.shadowRoot?.id === node.id) {
        parent.shadowRoot = node;
      } else {
        console.warn('There is a bug (1) here, this log should never append');
      }
    } else if (node.id === this.state.document?.id) {
      this.state.document = node;
    } else {
      console.warn('There is a bug (2) here, this log should never append');
    }
  }

  private getMethodInfo(eventType: RecordingEventType) {
    const Klass = this.constructor as any;
    const methodName = Klass.__events[eventType] as keyof CSDom | undefined;
    if (!methodName) return null;
    const args = Klass.__args[methodName];
    return {
      name: methodName,
      args,
    };
  }
}
