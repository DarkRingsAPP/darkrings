import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Landing from "./pages/Landing.jsx";
import Desk from "./pages/Desk.jsx";
import HowItWorks from "./pages/HowItWorks.jsx";
import Docs from "./pages/Docs.jsx";
import Security from "./pages/Security.jsx";
import About from "./pages/About.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";
import Markets from "./pages/Markets.jsx";
import Stats from "./pages/Stats.jsx";
import Changelog from "./pages/Changelog.jsx";
import Research from "./pages/Research.jsx";
import "./index.css";

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/desk", element: <Desk /> },
      { path: "/how-it-works", element: <HowItWorks /> },
      { path: "/docs", element: <Docs /> },
      { path: "/docs/:slug", element: <Docs /> },
      { path: "/security", element: <Security /> },
      { path: "/about", element: <About /> },
      { path: "/terms", element: <Terms /> },
      { path: "/privacy", element: <Privacy /> },
      { path: "/markets", element: <Markets /> },
      { path: "/stats", element: <Stats /> },
      { path: "/changelog", element: <Changelog /> },
      { path: "/research", element: <Research /> },
      { path: "/research/:slug", element: <Research /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 pt-16 text-center">
      <p className="num text-[12px] uppercase tracking-[0.2em] text-faint">404</p>
      <h1 className="display mt-3 text-[clamp(28px,5vw,44px)] uppercase text-bone">
        Nothing at this address
      </h1>
      <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-mute">
        Which, around here, is usually the point. This page though really does not exist.
      </p>
      <a
        href="/"
        className="mt-6 rounded-md bg-ember px-4 py-2 text-[13.5px] font-semibold text-void transition-colors hover:bg-ember-hot"
      >
        Back to the front page
      </a>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
