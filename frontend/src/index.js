// React provides StrictMode and the runtime needed by JSX.
import React from 'react';

// ReactDOM mounts the SPA into the public/index.html root element.
import ReactDOM from 'react-dom/client';

// CRA baseline styles remain available for browser defaults.
import './index.css';

// App is the root product component.
import App from './App';

// reportWebVitals optionally forwards browser performance metrics.
import reportWebVitals from './reportWebVitals';

// root binds React to the DOM node created by the static HTML shell.
const root = ReactDOM.createRoot(document.getElementById('root'));

// StrictMode helps surface unsafe React patterns during development.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Leave metrics disabled by default; pass a callback here if performance telemetry is needed.
reportWebVitals();
