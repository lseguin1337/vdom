import { useMemo, useState } from 'react';
import { RenderDOM } from './Render'
import { PlaybackEngine } from './PlayerEngine';
import { recordingEvents } from './events';

const playerEngine = new PlaybackEngine();

function App() {
  const [renderAt, setRenderAt] = useState(recordingEvents.length - 1);
  const virtualDOM = useMemo(() => {
    const events = recordingEvents.slice(0, renderAt);
    if (events.length === 0)
      playerEngine.clear();
    return playerEngine.apply(events).getVirtualDOM();
  }, [renderAt]);

  return (<>
    <h1>
      render at index:
      <select value={renderAt} onChange={(event) => setRenderAt(+event.target.value)}>
        {recordingEvents.map((_, index) => (<option value={index}>{index}</option>))}
      </select>
    </h1>
    <RenderDOM vdom={virtualDOM}></RenderDOM>
  </>);
}

export default App
