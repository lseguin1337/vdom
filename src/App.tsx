import { useMemo, useState } from 'react';
import { RenderDOM } from './Render'
import { VirtualDOM } from './VirtualDOM';
import { recordingEvents } from './events';

const vdom = new VirtualDOM();

function App() {
  const [isShort, setIsShort] = useState(false);
  const dom = useMemo(() => {
    if (isShort) {
      vdom.apply(recordingEvents.slice(0, 1));
    } else {
      vdom.apply(recordingEvents);
    }
    return vdom;
  }, [isShort]);

  return (<>
    <button onClick={() => setIsShort((isShort) => !isShort)}>Toggle</button>
    <RenderDOM nodes={dom.getNodes()} rootId={dom.getRootId()}></RenderDOM>
  </>);
}

export default App
