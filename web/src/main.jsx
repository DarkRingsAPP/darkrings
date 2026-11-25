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
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
