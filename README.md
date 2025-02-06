# Markdown Clever Lists README

Continue, indent and outdent markdown lists, intelligently changing marker styles based
on the rest of the document and user settings.


![Extension usage demo](/assets/demo.gif)

## Features

- Continue numbered and unnumbered markdown lists by pressing `Enter` at the end.
- Pressing `Enter` on empty list item reduces list level by one (change
  `markdown-clever-lists.blankListItemBehaviour` to disable this behaviour).
- `Ctrl+]` and `Ctrl+[` indents and outdents.
- Marker styles are kept consistent across levels.
- Marker styles are guessed from the rest of the document, with configurable defaults.
- Supported styles: `-`, `*`, `+`, `1.`, `1)`, checkboxes (e.g. `- [ ]`)
- Subsequent numbered lists are updated to keep them consistent


## Extension Settings

This extension contributes the following settings:

* `markdown-clever-lists.blankListItemBehaviour`: Set the behaviour when pressing
  `Enter` on blank list items.
* `markdown-clever-lists.defaultMarkers`: Configure the default list marker structure.
* `markdown-clever-lists.autoNumbering`: Whether to update the numbers of subsequent
  list items when indenting, outdenting or continuing a list


## Caveats

- Assumes that the list marker structure follows the tab size. Indenting and outdenting
  shifts the indentation level by the tab size, and selects the most appropriate marker
  for that tab size.
- Indenting and outdenting is done with `Ctrl+]` and `Ctrl+[` (or `Cmd` on Mac). If you
  have different keybindings for indenting and outdenting you'll need to change these
  too. Indenting by pressing `Tab` on selected text is not supported.


## Similar extensions

- [Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)
  has support for continuing lists, indenting and outdenting (and much more), but 
  without changing marker styles automatically
- [Markdown Continue](https://marketplace.visualstudio.com/items?itemName=tejasvi.markdown-continue)
  allows continuing lists by pressing `Enter`, but has not indent or outdent
  functionality.


## LICENSE

MIT License.


## Release Notes

### 1.1.0

- Subsequent numbered list items update when indenting, de-denting or adding a new item
- Fixed a bug where indenting or de-denting on the first line of the document caused an
  uncaught error


### 1.0.1

- Fix numbered lists not continuing correctly when there is a sub-list


### 1.0.0

Initial release.
