import { render } from "preact";
import { App } from "./app";

import "@fontsource-variable/space-grotesk";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
