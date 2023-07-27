// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { text } from "stream/consumers";
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('The "markdown-clever-lists" is extension now active');

  // vscode.window.showInformationMessage('Hello World from Markdown Clever Lists!');

  let enterDisposable = vscode.commands.registerTextEditorCommand(
    "markdown-clever-lists.onEnterKey",
    onEnterKey
  );
  context.subscriptions.push(enterDisposable);

  let outdentDisposable = vscode.commands.registerTextEditorCommand(
    "markdown-clever-lists.onOutdent",
    onOutdent
  );
  context.subscriptions.push(outdentDisposable);

  let indentDisposable = vscode.commands.registerTextEditorCommand(
    "markdown-clever-lists.onIndent",
    onIndent
  );
  context.subscriptions.push(indentDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function createIndentation(textEditor: vscode.TextEditor, level: number): string {
  if (textEditor.options.insertSpaces) {
    const tabSize = textEditor.options.tabSize as number;
    return " ".repeat(tabSize * level);
  } else {
    return "\t".repeat(level);
  }
}

/**
 * A class to hold the various parts of a list item line
 */
class ListItemParts {
  line: vscode.TextLine;
  indentation: string;
  indentationAsSpaces: string;
  level: number;
  marker: string;
  trailingSpaces: string;
  remainder: string;

  private tabSize: number;

  constructor(line: vscode.TextLine, textEditor: vscode.TextEditor) {
    this.line = line;

    const match = /^(\s*)([-*+](?: \[[xX ]\])?|[0-9]+[.)])( +)(.*)/.exec(line.text);
    if (match === null) {
      throw new Error("Line is not a list item");
    }

    this.tabSize = textEditor.options.tabSize as number;

    this.indentation = match[1];
    this.indentationAsSpaces = this.indentation.replace(
      /\t/g,
      " ".repeat(this.tabSize as number)
    );
    this.level = Math.floor(this.indentation.length / this.tabSize);
    this.marker = match[2];
    this.trailingSpaces = match[3];
    this.remainder = match[4];
  }

  /**
   * Returns the full marker, which includes the part of the indentation left over when
   * we remove all the pieces of length `tabSize`.
   *
   * @returns The full marker
   */
  getFullMarker(): string {
    const markerInitialSpaces = this.indentationAsSpaces.substring(
      this.level * this.tabSize
    );
    return markerInitialSpaces + this.marker;
  }

  /**
   * Returns the head of the marker, which is the indentation, the marker itself, and
   * the trailing spaces.
   *
   * @returns The head of the marker
   */
  getHead(): string {
    return this.indentation + this.marker + this.trailingSpaces;
  }
}

function getMarkerLevels(textEditor: vscode.TextEditor, maxLevel: number): string[] {
  const tabSize = textEditor.options.tabSize as number;
  const tabAsSpaces = " ".repeat(tabSize);

  var markerLevels: string[] = [];
  var levelsRecorded = 0;
  for (var i = 0; i < textEditor.document.lineCount; i++) {
    const line = textEditor.document.lineAt(i);

    // Divide the line up into line item parts
    var parts;
    try {
      parts = new ListItemParts(line, textEditor);
    } catch (e) {
      continue;
    }

    // Get the indentation size of the line and the index of the `markerLevel` array
    if (markerLevels.length > parts.level && markerLevels[parts.level] !== undefined) {
      continue;
    }
    if (parts.level > maxLevel) {
      continue;
    }

    // Get the full marker for the line, including initial spaces after the indentation
    markerLevels[parts.level] = parts.getFullMarker();

    // Once we've recorded the maximum number of levels, stop
    levelsRecorded++;
    if (levelsRecorded > maxLevel) {
      break;
    }
  }
  return markerLevels;
}

function determineFullMarker(markerLevels: string[], level: number): string {
  if (level >= markerLevels.length || markerLevels[level] === undefined) {
    return "-";
  } else {
    return markerLevels[level];
  }
}

/**
 * Increments the number in a given list item as a line. If the line is not a numbered
 * list item, it will do nothing.
 *
 * @param lineText The line text to increment the marker of
 * @returns The incremented marker
 */
function incrementMarkerNumber(lineText: string): string {
  const match = /^(\s*)([0-9]+)([.)])/.exec(lineText);
  if (match === null) {
    return lineText;
  }
  const indentation = match[1];
  const number = parseInt(match[2]);
  const nextNumber = String(number + 1);
  const delimiter = match[3];
  return indentation + nextNumber + delimiter + lineText.substring(match[0].length);
}

/**
 * Outdents the list item on a given line. If the line is a list item, it will will
 * decrease the indentation of the list item by one level, selecting the list marker by
 * looking upwards for next lowest marker level. If the line is not a list item, it will
 * do nothing.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 * @param markerLevels The list of marker levels to use when outdenting the list item
 * @param parts The list item parts of the line to outdent
 * @param stopAtFirstLevel Whether to stop at the first level of indentation. If false,
 *                         will remove the last level of indentation, removing the list
 *                        item entirely if it is at the first level of indentation.
 */
function outdentListItem(
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit,
  markerLevels: string[],
  parts: ListItemParts,
  stopAtFirstLevel: boolean = false
): void {
  var newHead = "";
  if (parts.level === 0 && stopAtFirstLevel) {
    return;
  }
  if (parts.level > 0) {
    newHead =
      createIndentation(textEditor, parts.level - 1) +
      determineFullMarker(markerLevels, parts.level - 1) +
      parts.trailingSpaces;
  }
  newHead = incrementMarkerNumber(newHead);
  edit.replace(
    parts.line.range.with(
      parts.line.range.start,
      new vscode.Position(parts.line.lineNumber, parts.getHead().length)
    ),
    newHead
  );
}

function indentListItem(
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit,
  markerLevels: string[],
  parts: ListItemParts
): void {
  let newHead =
    createIndentation(textEditor, parts.level + 1) +
    determineFullMarker(markerLevels, parts.level + 1) +
    parts.trailingSpaces;
  newHead = incrementMarkerNumber(newHead);
  edit.replace(
    parts.line.range.with(
      parts.line.range.start,
      new vscode.Position(parts.line.lineNumber, parts.getHead().length)
    ),
    newHead
  );
}

/**
 * This function is called when the user presses the enter key.
 * It will continue the list item if the cursor is on a nonempty list item.
 * If the cursor is on an empty list item, it will outdent the list item.
 * Otherwise, it will insert a new line as normal.
 * Works with multiple cursors.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 */
function onEnterKey(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
  const tabSize = textEditor.options.tabSize as number;
  const tabAsSpaces = " ".repeat(tabSize);

  // Check if every cursor is at the end of a list item line (excluding whitespace) and
  // get the maximum indentation level of the list items
  var allCursorsOnListItems = true;
  var maxLevel = 0;
  for (const selection of textEditor.selections) {
    const line = textEditor.document.lineAt(selection.active.line);
    var parts;
    try {
      parts = new ListItemParts(line, textEditor);
    } catch (e) {
      allCursorsOnListItems = false;
      break;
    }
    if (!/^\s*$/.test(line.text.substring(selection.active.character))) {
      allCursorsOnListItems = false;
      break;
    }
    if (parts.level > maxLevel) {
      maxLevel = parts.level;
    }
  }

  // Not every cursor is on a list item, so just insert a new line as normal
  if (!allCursorsOnListItems) {
    vscode.commands.executeCommand("type", {
      source: "keyboard",
      text: "\n",
    });
    return;
  }

  // Get the list markers for each level of indentation we might need
  const markerLevels = getMarkerLevels(textEditor, maxLevel - 1);

  for (const selection of textEditor.selections) {
    // Split the line into the indentation and the text
    const cursorPosition = selection.active;
    const line = textEditor.document.lineAt(cursorPosition.line);
    var parts;
    try {
      parts = new ListItemParts(line, textEditor);
    } catch (e) {
      console.error(`Line '${line.text}' should be a list item but isn't`);
      edit.insert(cursorPosition, "\n");
      continue;
    }

    if (parts.remainder === "") {
      // If the line consists of just a list marker, outdent it
      outdentListItem(textEditor, edit, markerLevels, parts);
    } else {
      // Otherwise insert a new line with the current list marker style
      const newMarkerLevel = incrementMarkerNumber(
        `${parts.indentation}${parts.marker}${parts.trailingSpaces}`
      );
      edit.insert(cursorPosition, `\n${newMarkerLevel}`);
    }
  }
}

/**
 * This function is called the selection is outdented. It changes all list item markers
 * in the selection to the previous marker level. If there is any line in the selections
 * or the previous line that is not a list item, it just executes the default outdent
 * command on everything. Similarly, if the first line in any selection is more than one
 * tab-width indented compared to the previous line, it will also execute the default
 * outdent command.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 */
function onOutdent(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {

  // Compute the line parts and maximum marker indent level in the selections, and check
  // whether or not we should used the default outdent command
  var maxLevel = 0;
  var parts: ListItemParts[][] = [];
  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    parts[j] = [];
    for (let i = Math.max(0, selection.start.line - 1); i <= selection.end.line; i++) {
      var currentParts;
      try {
        currentParts = new ListItemParts(
          textEditor.document.lineAt(i),
          textEditor
        );
      } catch (e) {
        vscode.commands.executeCommand("editor.action.outdentLines");
        return;
      }
      if (i > selection.start.line - 1) {
        parts[j].push(currentParts);
        if (currentParts.level > maxLevel) {
          maxLevel = currentParts.level;
        }
      }
    }
  }

  // Get the list markers for each level of indentation we might need
  const markerLevels = getMarkerLevels(textEditor, maxLevel - 1);

  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    for (let i = 0; i <= selection.end.line - selection.start.line; i++) {
      outdentListItem(textEditor, edit, markerLevels, parts[j][i], true);
    }
  }
}

/**
 * This function is called the selection is indented. It changes all list item markers
 * in the selection to the previous marker level. If there is any line in the selections
 * or the previous line that is not a list item, it just executes the default indent
 * command on everything. Similarly, if the first line in any selection is more than one
 * tab-width indented compared to the previous line, it will also execute the default
 * indent command.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 */
function onIndent(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {

  // Compute the line parts and maximum marker indent level in the selections, and check
  // whether or not we should used the default outdent command
  var maxLevel = 0;
  var parts: ListItemParts[][] = [];
  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    parts[j] = [];
    for (let i = Math.max(0, selection.start.line - 1); i <= selection.end.line; i++) {
      var currentParts;
      try {
        currentParts = new ListItemParts(
          textEditor.document.lineAt(i),
          textEditor
        );
      } catch (e) {
        vscode.commands.executeCommand("editor.action.indentLines");
        return;
      }
      if (i > selection.start.line - 1) {
        parts[j].push(currentParts);
        if (currentParts.level > maxLevel) {
          maxLevel = currentParts.level;
        }
      }
    }
  }

  // Get the list markers for each level of indentation we might need
  const markerLevels = getMarkerLevels(textEditor, maxLevel + 1);

  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    for (let i = 0; i <= selection.end.line - selection.start.line; i++) {
      indentListItem(textEditor, edit, markerLevels, parts[j][i]);
    }
  }
}