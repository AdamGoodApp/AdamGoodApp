import "./widget.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CvWidget } from "./CvWidget";

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<CvWidget />
		</StrictMode>,
	);
}
