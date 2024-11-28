import { useMemo, useState } from 'react';
import { RenderDOM } from './Render'
import { PlaybackEngine } from './PlayerEngine';
import { recordingEvents } from './events';

const playerEngine = new PlaybackEngine();

function App() {
  const [isShort, setIsShort] = useState(false);
  const virtualDOM = useMemo(() => {
    const events = isShort ? recordingEvents.slice(0, 1) : recordingEvents;
    return playerEngine.apply(events).getVirtualDOM();
  }, [isShort]);

  return (<>
    <button onClick={() => setIsShort((isShort) => !isShort)}>Toggle</button>
    <RenderDOM vdom={virtualDOM}></RenderDOM>
  </>);
}

export default App
