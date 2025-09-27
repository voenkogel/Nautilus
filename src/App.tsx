import Canvas from './components/Canvas';
import { ToastProvider } from './components/Toast';

function App() {
  return (
    <ToastProvider>
      <div className="w-screen h-screen overflow-hidden" style={{ background: "transparent" }}>
        <Canvas />
      </div>
    </ToastProvider>
  );
}

export default App;