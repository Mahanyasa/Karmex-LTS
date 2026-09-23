import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import SprintWorkspace from "./SprintWorkspace";
import api from "../api";

jest.mock("../api", () => ({ patch: jest.fn(), post: jest.fn(), delete: jest.fn() }));
const mockNotify = jest.fn();
jest.mock("../context/NotificationContext", () => ({ useNotifications: () => ({ notify: mockNotify, confirm: jest.fn() }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

const sprint = { _id: "sprint", name: "Sprint 1", status: "planned", stages: ["Ready", "Review", "Done"], startDate: "2026-09-23", endDate: "2026-10-07", capacity: 20 };
const todo = { _id: "task", sprint: "sprint", text: "Fix login", workflowStage: "Ready", storyPoints: 3, acceptanceCriteria: "Login succeeds", blockedReason: "" };
let container; let root; let props;
beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  props = { board: { _id: "board", sprints: [sprint] }, todos: [todo], canEdit: true, onBoardSaved: jest.fn(), onTodosChanged: jest.fn().mockResolvedValue(undefined) };
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
function render(overrides = {}) { act(() => root.render(<SprintWorkspace {...props} {...overrides} />)); }
function button(text) { return [...container.querySelectorAll("button")].find((node) => node.textContent === text); }
async function click(node) { await act(async () => { node.click(); }); }
async function submit() { await act(async () => { Simulate.submit(container.querySelector(".work-item-editor")); }); }

test("failed work item save preserves draft and never announces success", async () => {
  api.patch.mockRejectedValue({ response: { data: { message: "Save rejected" } } });
  render(); await click(button("Fix login"));
  const title = container.querySelector(".work-item-editor input");
  act(() => Simulate.change(title, { target: { value: "Keep this draft" } }));
  await submit();
  expect(container.querySelector(".work-item-editor input").value).toBe("Keep this draft");
  expect(mockNotify).toHaveBeenCalledWith("Save rejected", "error");
  expect(mockNotify.mock.calls.some((call) => call[1] === "success")).toBe(false);
  expect(props.onTodosChanged).not.toHaveBeenCalled();
});

test("successful stage save uses the server response and closes the editor", async () => {
  api.patch.mockResolvedValue({ data: { ...todo, workflowStage: "Done", completed: true } });
  render(); await click(button("Fix login"));
  const selects = container.querySelectorAll(".work-item-editor select");
  act(() => Simulate.change(selects[2], { target: { value: "Done" } }));
  await submit();
  expect(api.patch).toHaveBeenCalledWith("/todos/task", expect.objectContaining({ workflowStage: "Done" }));
  expect(container.querySelector(".work-item-editor")).toBeNull();
  expect(mockNotify).toHaveBeenCalledWith("Work item updated.", "success");
});

test("shared readers can inspect cards and details without mutation controls", async () => {
  render({ canEdit: false });
  expect(container.textContent).toContain("Fix login");
  expect(button("New sprint")).toBeUndefined(); expect(button("Start")).toBeUndefined();
  expect(container.querySelector(".sprint-kanban article").draggable).toBe(false);
  await click(button("Fix login"));
  expect(container.querySelector("fieldset").disabled).toBe(true);
  expect(container.querySelector("textarea").value).toBe("Login succeeds");
  expect(button("Save work item")).toBeUndefined(); expect(button("Move to backlog")).toBeUndefined();
  await submit();
  expect(api.patch).not.toHaveBeenCalled();
});

test("planned/completed sprints do not expose invalid lifecycle actions", () => {
  render(); expect(button("Start").disabled).toBe(false); expect(button("Complete").disabled).toBe(true);
  render({ board: { _id: "board", sprints: [{ ...sprint, status: "completed" }] } });
  expect(button("Start").disabled).toBe(true); expect(button("Complete").disabled).toBe(true);
});

test("failed move to backlog leaves the work item open", async () => {
  api.patch.mockRejectedValue(new Error("offline"));
  render(); await click(button("Fix login")); await click(button("Move to backlog"));
  expect(container.querySelector(".work-item-editor")).not.toBeNull();
  expect(mockNotify.mock.calls.some((call) => call[1] === "success")).toBe(false);
});

test("switching boards clears the previous board's open editor", async () => {
  render(); await click(button("Fix login"));
  render({ board: { _id: "other", sprints: [] }, todos: [] });
  expect(container.querySelector(".work-item-editor")).toBeNull();
});

test("a saved item with a failed refresh reports the refresh failure accurately", async () => {
  api.patch.mockResolvedValue({ data: { ...todo } });
  render({ onTodosChanged: jest.fn().mockResolvedValue(false) });
  await click(button("Fix login")); await submit();
  expect(container.querySelector(".work-item-editor")).toBeNull();
  expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("saved, but the board could not refresh"), "warning");
  expect(mockNotify.mock.calls.some((call) => call[1] === "success")).toBe(false);
});
