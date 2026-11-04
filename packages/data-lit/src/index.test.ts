// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import * as dataLit from "./index.js";

describe("@adobe/data-lit public exports", () => {
    it.each([
        "useState", "useEffect", "useConnected", "useMemo", "useRef", "useObservable", "useObservableValues",
        "useWindowEvent", "useResizeObserver", "useDebounce", "useElement", "useUpdated", "usePointerObserve",
        "useDraggable", "useDragObserve", "useDragGenerator", "useDragTransaction",
        "withHooks", "attachDecorator", "installHooksController",
        "ApplicationHost", "ApplicationElement", "DatabaseElement",
        "applyDecorator", "applyServiceDecorators", "requireService",
    ])("exports the function %s", name => {
        expect(typeof (dataLit as Record<string, unknown>)[name]).toBe("function");
    });

    it("exports the component stack and the Template helpers", () => {
        expect(typeof dataLit.Component_stack.active).toBe("function");
        expect(typeof dataLit.Template.from).toBe("function");
    });

    it("registers the application-host element", () => {
        expect(customElements.get("application-host")).toBe(dataLit.ApplicationHost);
    });
});
