import { Component, type ReactNode } from "react";
import { setUi } from "#/store/ui";

export class ErrorBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.error(error);
		setUi({ tier: "fallback" });
	}

	render() {
		return this.state.failed ? null : this.props.children;
	}
}
