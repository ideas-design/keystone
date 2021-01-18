import { Descendant, Editor, Transforms, Node, PathRef, Path } from 'slate';
import { ReactEditor } from 'slate-react';
import { deserializeHTML } from './html';
import { deserializeMarkdown } from './markdown';

function insertFragmentButDifferent(editor: ReactEditor, nodes: Descendant[]) {
  if (Editor.isBlock(editor, nodes[0])) {
    let pathRefForEmptyParagraphAtCursor: PathRef | undefined;
    if (editor.selection) {
      const path = Path.parent(editor.selection.anchor.path);
      const node = Node.get(editor, path);
      if (node.type === 'paragraph' && Node.string(node) === '') {
        pathRefForEmptyParagraphAtCursor = Editor.pathRef(editor, path);
      }
    }
    Transforms.insertNodes(editor, nodes);
    let path = pathRefForEmptyParagraphAtCursor?.unref();
    if (path) {
      Transforms.removeNodes(editor, { at: path });
    }
  } else {
    Transforms.insertFragment(editor, nodes);
  }
}

export function withPasting(editor: ReactEditor) {
  const { insertData, setFragmentData } = editor;

  editor.setFragmentData = data => {
    if (editor.selection) {
      data.setData('application/x-keystone-document-editor', 'true');
    }
    setFragmentData(data);
  };

  editor.insertData = data => {
    // this exists because behind the scenes, Slate sets the slate document
    // on the data transfer, this is great because it means when you copy and paste
    // something in the editor or between editors, it'll use the actual Slate data
    // rather than the serialized html so component blocks and etc. will work fine
    // we're setting application/x-keystone-document-editor
    // though so that we only accept slate data from Keystone's editor
    // because other editors will likely have a different structure
    // so we'll rely on the html deserialization instead
    // (note that yes, we do call insertData at the end of this function
    // which is where Slate's logic will run, it'll never do anything there though
    // since anything that will have slate data will also have text/html which we handle
    // before we call insertData)
    // TODO: handle the case of copying between editors with different components blocks
    // (right now, things will blow up in most cases)
    if (data.getData('application/x-keystone-document-editor') === 'true') {
      insertData(data);
      return;
    }
    const blockAbove = Editor.above(editor, { match: node => Editor.isBlock(editor, node) });
    if (blockAbove?.[0].type === 'code') {
      const plain = data.getData('text/plain');
      editor.insertText(plain);
    }
    let vsCodeEditorData = data.getData('vscode-editor-data');
    if (vsCodeEditorData) {
      try {
        const vsCodeData = JSON.parse(vsCodeEditorData);
        if (vsCodeData?.mode === 'markdown' || vsCodeData?.mode === 'mdx') {
          const plain = data.getData('text/plain');
          if (plain) {
            const fragment = deserializeMarkdown(plain);
            insertFragmentButDifferent(editor, fragment);
            return;
          }
        }
      } catch (err) {
        console.log(err);
      }
    }

    let html = data.getData('text/html');

    if (html) {
      const fragment = deserializeHTML(html);
      insertFragmentButDifferent(editor, fragment);
      return;
    }

    const plain = data.getData('text/plain');
    if (plain) {
      const fragment = deserializeMarkdown(plain);
      insertFragmentButDifferent(editor, fragment);
      return;
    }

    insertData(data);
  };

  return editor;
}
