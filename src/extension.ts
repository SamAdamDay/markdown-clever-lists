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

/**
 * Creates indentation up to the given level, based on the text editor's settings.
 *
 * @param textEditor The text editor
 * @param level The level of indentation to create
 *
 * @returns The indentation string
 */
function createIndentation(textEditor: vscode.TextEditor, level: number): string {
  if (textEditor.options.insertSpaces) {
    const tabSize = textEditor.options.tabSize as number;
    return " ".repeat(tabSize * level);
  } else {
    return "\t".repeat(level);
  }
}

class NotAListItemError extends Error {}

/**
 * A class to hold the various parts of a list item line
 *
 * @property line The original text line
 * @property initialSpacing All the space characters before the list marker
 * @property indentationAsSpaces All the space characters before the list marker, but
 * converted to spaces
 * @property level The indentation level, which is the floor of the number of initial
 * spaces divided by the tab size
 * @property marker The list marker
 * @property markerInitialSpaces The spaces before the marker left over after we remove
 * the indentation level times the tab size from the initial spacing
 * @property markerTrailingSpaces The spaces after the marker but before the remainder
 * of the line
 * @property remainder The remainder of the line after the list marker and trailing
 * spaces
 */
class ParsedLine {
  line: vscode.TextLine;
  textEditor: vscode.TextEditor;
  initialSpacing: string;
  initialSpacingAsSpaces: string;
  level: number;
  marker: string;
  markerInitialSpaces: string;
  markerIsNumber: boolean;
  markerNumber?: number;
  markerDelimiter?: string;
  markerTrailingSpaces: string;
  remainder: string;
  protected tabSize: number;

  constructor(line: vscode.TextLine, textEditor: vscode.TextEditor) {
    this.line = line;
    this.textEditor = textEditor;
    this.tabSize = textEditor.options.tabSize as number;

    // Parse the line into its parts
    const match = /^(\s*)([-*+](?: \[[xX ]\])?|[0-9]+[.)])( +)(.*)/.exec(line.text);
    if (match === null) {
      throw new NotAListItemError();
    }

    this.initialSpacing = match[1];
    this.initialSpacingAsSpaces = this.getInitialSpacingAsSpaces();
    this.level = Math.floor(this.initialSpacing.length / this.tabSize);
    this.markerInitialSpaces = this.initialSpacingAsSpaces.substring(
      this.level * this.tabSize
    );
    this.marker = match[2];
    this.markerTrailingSpaces = match[3];
    this.remainder = match[4];

    this.markerIsNumber = false;
    this.parseMarker();
  }

  /**
   * Parses the marker into its parts. If the marker is a number, it will set the marker
   * number and delimiter. Otherwise, it won't set anything.
   */
  protected parseMarker(): void {
    const markerMatch = /^([0-9]+)([.)])/.exec(this.marker);
    if (markerMatch !== null) {
      this.markerNumber = parseInt(markerMatch[1]);
      this.markerDelimiter = markerMatch[2];
      this.markerIsNumber = true;
    } else {
      this.markerIsNumber = false;
    }
  }

  /**
   * Returns the initial spacing with tabs converted to spaces.
   *
   * @returns The initial spacing as spaces
   */
  protected getInitialSpacingAsSpaces(): string {
    return this.initialSpacing.replace(/\t/g, " ".repeat(this.tabSize as number));
  }

  /**
   * Returns the full marker, which is the marker initial spaces and the marker itself.
   *
   * @returns The full marker
   */
  public getFullMarker(): string {
    return this.markerInitialSpaces + this.marker;
  }

  /**
   * Returns the head of the marker, which everything but the remainder of the line,
   * i.e. the initial spacing, the marker itself, and the trailing spaces.
   *
   * @returns The head of the marker
   */
  public getHead(): string {
    return this.initialSpacing + this.marker + this.markerTrailingSpaces;
  }
}

/**
 * A class which holds a version of a parsed line which can be modified.
 * @extends ParsedLine
 */
class EditedParsedLine extends ParsedLine {
  originalParsedLine?: ParsedLine;

  /*
   * Creates an EditedParsedLine from a ParsedLine.
   *
   * @param parsedLine The ParsedLine to create an EditedParsedLine from
   * @returns The EditedParsedLine
   */
  static fromParsedLine(parsedLine: ParsedLine): EditedParsedLine {
    const editedParsedLine = new EditedParsedLine(
      parsedLine.line,
      parsedLine.textEditor
    );
    editedParsedLine.originalParsedLine = parsedLine;
    return editedParsedLine;
  }

  /**
   * Sets the marker to the given string.
   *
   * @param marker The marker to set
   */
  public setMarker(marker: string): void {
    this.marker = marker;
    this.parseMarker();
  }

  /**
   * Sets the full marker to the given string, which includes the initial spacing after
   * the indentation.
   *
   * @param fullMarker The full marker to set
   */
  public setFullMarker(fullMarker: string): void {
    const fullMarkerMatch = /^(\s*)([-*+](?: \[[xX ]\])?|[0-9]+[.)])/.exec(fullMarker);
    if (fullMarkerMatch === null) {
      throw new Error("Invalid full marker");
    }
    this.markerInitialSpaces = fullMarkerMatch[1];
    this.initialSpacing = createIndentation(this.textEditor, this.level);
    this.initialSpacing = this.initialSpacing + this.markerInitialSpaces;
    this.initialSpacingAsSpaces = this.getInitialSpacingAsSpaces();
    this.setMarker(fullMarkerMatch[2]);
  }

  /**
   * Sets the marker number, if the marker is a number. Otherwise, throws an error.
   *
   * @param number The number to set the marker to
   */
  public setMarkerNumber(number: number): void {
    if (!this.markerIsNumber) {
      throw new Error("Marker is not a number");
    }
    this.markerNumber = number;
    this.marker = `${number}${this.markerDelimiter}`;
  }

  /**
   * Sets the indentation level to the given level.
   *
   * @param level The level to set the indentation to
   */
  public setIndentationLevel(level: number): void {
    this.level = level;
    this.initialSpacing = createIndentation(this.textEditor, level);
    this.initialSpacing = this.initialSpacing + this.markerInitialSpaces;
    this.initialSpacingAsSpaces = this.getInitialSpacingAsSpaces();
  }

  /**
   * Sets the indentation level to the given level and determines the marker based on
   * the marker levels in the document.
   *
   * @param level The level to set the indentation to
   * @param markerLevels The marker levels in the document
   */
  public setIndentationLevelAndDetermineMarker(
    level: number,
    markerLevels: string[]
  ): void {
    const newFullMarker = determineFullMarker(markerLevels, level);
    this.setIndentationLevel(level);
    this.setFullMarker(newFullMarker);
    if (this.markerIsNumber) {
      const newNumber = determineMarkerNumber(
        this.textEditor,
        this.line.lineNumber,
        this.level
      );
      this.setMarkerNumber(newNumber);
    }
  }

  /**
   * Updates the head of the line in the text editor to match the head of the line in
   * the EditedParsedLine.
   *
   * @param edit The edit object that allows us to modify the text editor
   */
  public updateEditorHead(edit: vscode.TextEditorEdit): void {
    if (this.originalParsedLine === undefined) {
      throw new Error("Original parsed line is undefined");
    }
    edit.replace(
      this.originalParsedLine.line.range.with(
        this.originalParsedLine.line.range.start,
        new vscode.Position(
          this.originalParsedLine.line.lineNumber,
          this.originalParsedLine.getHead().length
        )
      ),
      this.getHead()
    );
  }
}

/**
 * Get the marker heads for all indentation levels in the document, up to the given
 * maximum level.
 *
 * @param textEditor The text editor
 * @param maxLevel The maximum level to get marker heads for
 * @returns An array of marker heads, indexed by indentation level
 */
function getMarkerLevels(textEditor: vscode.TextEditor, maxLevel: number): string[] {
  const tabSize = textEditor.options.tabSize as number;
  const tabAsSpaces = " ".repeat(tabSize);
  const activeLineNumber = textEditor.selection.active.line;

  var markerLevels: string[] = [];
  var levelsRecorded = 0;
  for (var i = 0; i < textEditor.document.lineCount; i++) {
    // Start at the active line and work up, then down
    var lineNumber;
    if (i <= activeLineNumber) {
      lineNumber = activeLineNumber - i;
    } else {
      lineNumber = i;
    }

    const line = textEditor.document.lineAt(lineNumber);

    // Divide the line up into line item parts
    var parsedLine;
    try {
      parsedLine = new ParsedLine(line, textEditor);
    } catch (e) {
      if (e instanceof NotAListItemError) {
        continue;
      }
      throw e;
    }

    // Get the indentation size of the line and the index of the `markerLevel` array
    if (
      markerLevels.length > parsedLine.level &&
      markerLevels[parsedLine.level] !== undefined
    ) {
      continue;
    }
    if (parsedLine.level > maxLevel) {
      continue;
    }

    // Get the full marker for the line, including initial spaces after the indentation
    markerLevels[parsedLine.level] = parsedLine.getFullMarker();

    // Once we've recorded the maximum number of levels, stop
    levelsRecorded++;
    if (levelsRecorded > maxLevel) {
      break;
    }
  }
  return markerLevels;
}

/**
 * Determines the full marker for a given level, based on the marker levels in the
 * document. If the level is not recorded, it will use the default bullets based on the
 * user's settings.
 *
 * @param markerLevels The marker levels in the document
 * @param level The level to get the marker for
 * @returns The full marker for the given level
 */
function determineFullMarker(markerLevels: string[], level: number): string {
  if (level >= markerLevels.length || markerLevels[level] === undefined) {
    const config = vscode.workspace.getConfiguration("markdown-clever-lists");
    const bullets = config.get("defaultMarkers") as string[];
    if (bullets.length === 0) {
      console.log("No default bullets set");
      return "-";
    }
    return bullets[level % bullets.length];
  } else {
    return markerLevels[level];
  }
}

/**
 * Determines the marker number for a given line based on context. If the line is not a
 * numbered list item, it will throw an error.
 *
 * @param textEditor The text editor
 * @param lineNumber The line number to get the marker number for
 * @param indentationLevel The indentation level of the line
 * @returns The marker number determined from context
 */
function determineMarkerNumber(
  textEditor: vscode.TextEditor,
  lineNumber: number,
  indentationLevel: number
): number {
  // Get the most recent numbered list item above the current line
  var number = 0;
  var currentLineNumber = lineNumber;
  while (currentLineNumber >= 0) {
    currentLineNumber--;
    const currentLine = textEditor.document.lineAt(currentLineNumber);
    try {
      const currentParsedLine = new ParsedLine(currentLine, textEditor);
      if (
        currentParsedLine.markerIsNumber &&
        currentParsedLine.level === indentationLevel
        ) {
        number = currentParsedLine.markerNumber as number;
        break;
      }
      if (currentParsedLine.level < indentationLevel) {
        break;
      }
    } catch (e) {
      if (e instanceof NotAListItemError) {
        continue;
      }
      throw e;
    }
  }

  return number + 1;
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
 * @param parsedLine The parsed line to outdent
 * @param stopAtFirstLevel Whether to stop at the first level of indentation. If false,
 *                         will remove the last level of indentation, removing the list
 *                        item entirely if it is at the first level of indentation.
 */
function outdentListItem(
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit,
  markerLevels: string[],
  parsedLine: ParsedLine
): void {
  if (parsedLine.level === 0) {
    return;
  }
  const editedParsedLine = EditedParsedLine.fromParsedLine(parsedLine);
  editedParsedLine.setIndentationLevelAndDetermineMarker(
    parsedLine.level - 1,
    markerLevels
  );
  editedParsedLine.updateEditorHead(edit);
}

/**
 * Indents the list item on a given line, changing the marker as appropriate.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 * @param markerLevels The list of marker levels to use when indenting the list item
 * @param parsedLine The parsed line to indent
 */
function indentListItem(
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit,
  markerLevels: string[],
  parsedLine: ParsedLine
): void {
  const editedParsedLine = EditedParsedLine.fromParsedLine(parsedLine);
  editedParsedLine.setIndentationLevelAndDetermineMarker(
    parsedLine.level + 1,
    markerLevels
  );
  editedParsedLine.updateEditorHead(edit);
}

/**
 * This function is called when the user presses the enter key. It will continue the
 * list item if the cursor is on a nonempty list item. If the cursor is on an empty list
 * item, it will outdent the list item. Otherwise, it will insert a new line as normal.
 * Works with multiple cursors.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 */
function onEnterKey(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
  const tabSize = textEditor.options.tabSize as number;
  const tabAsSpaces = " ".repeat(tabSize);
  const config = vscode.workspace.getConfiguration("markdown-clever-lists");

  // Check if every cursor is at the end of a list item line (excluding whitespace) and
  // get the maximum indentation level of the list items
  var allCursorsOnListItems = true;
  var maxLevel = 0;
  for (const selection of textEditor.selections) {
    const line = textEditor.document.lineAt(selection.active.line);
    var parsedLine;
    try {
      parsedLine = new ParsedLine(line, textEditor);
    } catch (e) {
      if (e instanceof NotAListItemError) {
        allCursorsOnListItems = false;
        break;
      }
      throw e;
    }
    if (!/^\s*$/.test(line.text.substring(selection.active.character))) {
      allCursorsOnListItems = false;
      break;
    }
    if (parsedLine.level > maxLevel) {
      maxLevel = parsedLine.level;
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
    var parsedLine;
    try {
      parsedLine = new ParsedLine(line, textEditor);
    } catch (e) {
      if (e instanceof NotAListItemError) {
        console.error(`Line '${line.text}' should be a list item but isn't`);
        edit.insert(cursorPosition, "\n");
        continue;
      }
      throw e;
    }

    if (parsedLine.remainder === "") {
      // If the line consists of just a list marker, either outdent or remove it
      if (config.get("blankListItemBehaviour") === "Remove List Item") {
        edit.delete(line.range);
      } else {
        outdentListItem(textEditor, edit, markerLevels, parsedLine);
      }
    } else {
      // Otherwise insert a new line with the current list marker style
      const newParsedLine = EditedParsedLine.fromParsedLine(parsedLine);
      if (newParsedLine.markerIsNumber) {
        const newNumber = determineMarkerNumber(
          textEditor,
          line.lineNumber + 1,
          parsedLine.level
        );
        newParsedLine.setMarkerNumber(newNumber);
      }
      edit.insert(cursorPosition, "\n" + newParsedLine.getHead());
    }
  }
}

/**
 * This function is called the selection is outdented. It changes all list item markers
 * in the selection to the previous marker level. If there is any line in the selections
 * or the previous line that is not a list item, it just executes the default outdent
 * command on everything.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 */
function onOutdent(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
  // Compute the line parts and maximum marker indent level in the selections, and check
  // whether or not we should used the default outdent command
  var maxLevel = 0;
  var parsedLines: ParsedLine[][] = [];
  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    parsedLines[j] = [];
    for (let i = Math.max(0, selection.start.line - 1); i <= selection.end.line; i++) {
      var currentParsedLine;
      try {
        currentParsedLine = new ParsedLine(textEditor.document.lineAt(i), textEditor);
      } catch (e) {
        if (e instanceof NotAListItemError) {
          vscode.commands.executeCommand("editor.action.outdentLines");
          return;
        }
        throw e;
      }
      if (i > selection.start.line - 1) {
        parsedLines[j].push(currentParsedLine);
        if (currentParsedLine.level > maxLevel) {
          maxLevel = currentParsedLine.level;
        }
      }
    }
  }

  // Get the list markers for each level of indentation we might need
  const markerLevels = getMarkerLevels(textEditor, maxLevel - 1);

  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    for (let i = 0; i <= selection.end.line - selection.start.line; i++) {
      outdentListItem(textEditor, edit, markerLevels, parsedLines[j][i]);
    }
  }
}

/**
 * This function is called the selection is indented. It changes all list item markers
 * in the selection to the previous marker level. If there is any line in the selections
 * or the previous line that is not a list item, it just executes the default indent
 * command on everything.
 *
 * @param textEditor The text editor that the user is typing in
 * @param edit The edit object that allows us to modify the text editor
 */
function onIndent(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
  // Compute the line parts and maximum marker indent level in the selections, and check
  // whether or not we should used the default outdent command
  var maxLevel = 0;
  var parsedLine: ParsedLine[][] = [];
  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    parsedLine[j] = [];
    for (let i = Math.max(0, selection.start.line - 1); i <= selection.end.line; i++) {
      var currentParsedLine;
      try {
        currentParsedLine = new ParsedLine(textEditor.document.lineAt(i), textEditor);
      } catch (e) {
        if (e instanceof NotAListItemError) {
          vscode.commands.executeCommand("editor.action.indentLines");
          return;
        }
        throw e;
      }
      if (i > selection.start.line - 1) {
        parsedLine[j].push(currentParsedLine);
        if (currentParsedLine.level > maxLevel) {
          maxLevel = currentParsedLine.level;
        }
      }
    }
  }

  // Get the list markers for each level of indentation we might need
  const markerLevels = getMarkerLevels(textEditor, maxLevel + 1);

  for (let j = 0; j < textEditor.selections.length; j++) {
    const selection = textEditor.selections[j];
    for (let i = 0; i <= selection.end.line - selection.start.line; i++) {
      indentListItem(textEditor, edit, markerLevels, parsedLine[j][i]);
    }
  }
}
