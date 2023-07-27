// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('The "markdown-clever-lists" is extension now active');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerTextEditorCommand(
    "markdown-clever-lists.continueList",
    onEnterKey
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

/**
 * Checks if the indentation of the first argument is smaller than the indentation of
 * the second argument, taking into account the tab size of the text editor.
 *
 * @param indentation1 The first indentation to compare
 * @param indentation2 The second indentation to compare
 * @param textEditor The text editor that the user is typing in
 * @returns True if the indentation of the first argument is smaller than the
 * indentation of the second argument, false otherwise
 */
function isIndentationSmaller(
  indentation1: string,
  indentation2: string,
  textEditor: vscode.TextEditor
): boolean {
  const tabAsSpaces = " ".repeat(textEditor.options.tabSize as number);
  const indentation1Spaces = indentation1.replace(/\t/g, tabAsSpaces);
  const indentation2Spaces = indentation2.replace(/\t/g, tabAsSpaces);
  return indentation1Spaces.length < indentation2Spaces.length;
}

/**
 * Returns a string containing the next lowest marker level, including its indentation.
 * If there is no next lowest marker level, it returns an empty string.
 *
 * @param textEditor The text editor that the user is typing in
 * @param line The line that the user is typing on
 * @returns A string containing the next lowest marker level, including its indentation
 */
function getPreviousMarkerLevel(
  textEditor: vscode.TextEditor,
  line: vscode.TextLine
): string {
  const lineNumber = line.lineNumber;
  const indentation = line.text.substring(
    0,
    line.firstNonWhitespaceCharacterIndex
  );
  var currentLineNumber = lineNumber - 1;
  while (currentLineNumber >= 0) {
    const currentLine = textEditor.document.lineAt(currentLineNumber);
    const currentLineIndentation = currentLine.text.substring(
      0,
      currentLine.firstNonWhitespaceCharacterIndex
    );
    if (isIndentationSmaller(currentLineIndentation, indentation, textEditor)) {
      const previousLevelMatch =
        /^\s*(([-*+]( \[[xX ]\])?|([0-9]+)[.)]) +)?/.exec(currentLine.text);
      if (previousLevelMatch === null) {
        return "";
      }
      return previousLevelMatch[0];
    }
    currentLineNumber--;
  }
  return "";
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
  return (
    indentation + nextNumber + delimiter + lineText.substring(match[0].length)
  );
}

/**
 * Deindents the list item on a given line. If the line is a list item, it will
 * will decrease the indentation of the list item by one level, selecting the list
 * marker by looking upwards for next lowest marker level. If the line is not a list
 * item, it will do nothing.
 *
 * @param textEditor The text editor that the user is typing in
 * @param line The line that the user is typing on
 */
function deindentListItem(
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit,
  line: vscode.TextLine
): void {
  const currentLevelMatch = /^\s*(([-*+]( \[[xX ]\])?|([0-9]+)[.)]) +)?/.exec(
    line.text
  );
  if (currentLevelMatch === null) {
    return;
  }
  const currentMarkerLevel = currentLevelMatch[0];
  const previousMarkerLevel = getPreviousMarkerLevel(textEditor, line);
  const newMarkerLevel = incrementMarkerNumber(previousMarkerLevel);
  edit.replace(
    line.range.with(
      line.range.start,
      new vscode.Position(line.lineNumber, currentMarkerLevel.length)
    ),
    newMarkerLevel
  );
}

/**
 * This function is called when the user presses the enter key.
 * It will continue the list item if the cursor is on a nonempty list item.
 * If the cursor is on an empty list item, it will unindent the list item.
 * Otherwise, it will insert a new line as normal.
 * Works with multiple cursors.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 */
function onEnterKey(
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit
): void {
  // Check if every cursor is on a list item
  const allCursorsOnListItems = textEditor.selections.every(
    (selection: vscode.Selection) => {
      const lineText = textEditor.document.lineAt(selection.active.line).text;
      return /^\s*([-*+]( \[[xX ]\])?|([0-9]+)[.)]) /.test(lineText);
    }
  );

  // Not every cursor is on a list item, so just insert a new line as normal
  if (!allCursorsOnListItems) {
    vscode.commands.executeCommand("type", {
      source: "keyboard",
      text: "\n",
    });
    return;
  }

  for (const selection of textEditor.selections) {
    // Split the line into the indentation and the text
    const cursorPosition = selection.active;
    const line = textEditor.document.lineAt(cursorPosition.line);
    const indentation = line.text.substring(
      0,
      line.firstNonWhitespaceCharacterIndex
    );
    const lineText = line.text.substring(line.firstNonWhitespaceCharacterIndex);

    if (/^([-*+]( \[[xX ]\])?|([0-9]+)[.)]) +$/.test(lineText)) {
      // If the line consists of just a list marker, deindent it
      deindentListItem(textEditor, edit, line);
      // const rangeToDelete = line.range.with(
      //   cursorPosition.with(
      //     line.lineNumber,
      //     line.firstNonWhitespaceCharacterIndex
      //   ),
      //   line.range.end
      // );
      // edit.delete(rangeToDelete);
    } else if (/^([-*+]( \[[xX ]\])?|[0-9]+[.)]) /.test(lineText)) {
      // If the line starts with a bullet list marker, insert a new line with that
      // marker
      const markerMatch = /^([-*+](?: \[[xX ]\])?|[0-9]+[.)])( +)/.exec(
        lineText
      );
      if (markerMatch === null) {
        continue;
      }
      const marker = markerMatch[1];
      const afterMarkerSpacing = markerMatch[2];
      const newMarkerLevel = incrementMarkerNumber(
        `${indentation}${marker}${afterMarkerSpacing}`
      );
      edit.insert(cursorPosition, `\n${newMarkerLevel}`);
    } else {
      // We don't know what to do with this line, so just insert a new line as
      // normal
      edit.insert(cursorPosition, "\n");
    }
  }
}
