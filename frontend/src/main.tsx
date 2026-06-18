import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import "./index.css";
import App from "./App";
import Gallery from "./pages/Gallery";
import CardDetail from "./pages/CardDetail";
import RiskCheck from "./pages/RiskCheck";
import Ingest from "./pages/Ingest";
import Graph from "./pages/Graph";
import Curator from "./pages/Curator";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Gallery /> },
      { path: "graph", element: <Graph /> },
      { path: "curator", element: <Curator /> },
      { path: "risk", element: <RiskCheck /> },
      { path: "ingest", element: <Ingest /> },
      { path: "card/:id", element: <CardDetail /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
