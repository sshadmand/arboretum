import React, { Component, PropTypes } from 'react';
import ReactDOM from 'react-dom';
import { connect } from 'react-redux';
import classNames from 'classnames';

import { setNodeAttribute, insertNode, deleteNode, moveNode, selectNode,
         clearSelection } from './actions';
import { getNextNodePath, getPreviousNodePath, splitPath } from './utils';

export const Outline = connect(state => ({
  meta: state.meta,
  nodes: state.nodes
}))(
  ({ dispatch, meta, nodes }) =>
    <OutlineTree dispatch={dispatch} meta={meta} root={nodes} nodes={nodes}
                 path="" />
);

export const OutlineTree = (props) =>
  <ul className="outline">
    {props.nodes.map((node, index) =>
      <OutlineNode {...props} node={node} siblings={props.nodes}
                   key={index} path={props.path + index} />
    )}
  </ul>;

export const OutlineNode = React.createClass({
  getInitialState() {
    const { node } = this.props;
    return {
      editorValue: node.get('title'),
      dragging: false,
      positionPreview: null
    };
  },
  componentWillReceiveProps(nextProps) {
    if (this.props.node != nextProps.node) {
      this.setState({ editorValue: nextProps.node.get('title') });
    }
  },
  render() {
    const { dispatch, meta, root, node, path } = this.props;
    const { positionPreview, editorValue, dragging } = this.state;

    // HACK: Disable dragging when any node is edited.
    // On Firefox, input fields don't receive mouse clicks
    // when a parent has draggable=true
    //
    // https://bugzilla.mozilla.org/show_bug.cgi?id=800050
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1189486
    const selected = node.get('selected');
    const draggable = !meta.get('selected');
    const hasChildren = node.has('children');
    const isCollapsed = !!node.get('collapsed');

    const { title } = node.toJS();

    const className = classNames({
      'outline-node': true,
      'dragging': dragging,
      'editing': selected,
      'selected': selected,
      'has-children': hasChildren,
      'collapsed': isCollapsed,
      'position-preview-adopt':
        positionPreview == moveNode.positions.ADOPT,
      'position-preview-before':
        positionPreview == moveNode.positions.BEFORE,
      'position-preview-after':
        positionPreview == moveNode.positions.AFTER,
    });

    return (
      <li className={className} draggable={draggable}
          onDragStart={this.onDragStart} onDragEnter={this.onDragEnter}
          onDragOver={this.onDragOver} onDragLeave={this.onDragLeave}
          onDragEnd={this.onDragEnd} onDrop={this.onDrop}>

        {selected ?
          <div className="content">
            <button className="delete"
                    onClick={this.onDelete}>X</button>
            <input className="editor" autoFocus={true} ref={moveCursorToEnd}
                   type="text" size="50" value={editorValue}
                   onKeyDown={this.onEditorKeyDown}
                   onKeyUp={this.onEditorKeyUp}
                   onBlur={this.onEditorBlur}
                   onChange={this.onEditorChange} />
          </div>
          :
          <div className="content">
            <button className="collapse" disabled={!hasChildren}
                    onClick={this.onToggleCollapsed}>
              &nbsp;
            </button>
            <span className="title"
                  onClick={this.onSelectionClick}>{title}</span>
          </div>
        }

        {!isCollapsed && hasChildren &&
          <OutlineTree dispatch={dispatch} meta={meta} root={root}
                       nodes={node.get('children')}
                       path={path + '.children.'} />}

      </li>
    );
  },
  onSelectionClick(ev) {
    const { dispatch, path } = this.props;
    dispatch(selectNode(path));
  },
  onDelete(ev) {
    const { dispatch, path } = this.props;
    dispatch(deleteNode(path))
    return stahp(ev);
  },
  onToggleCollapsed(ev) {
    const { dispatch, node, path } = this.props;
    dispatch(setNodeAttribute(path, 'collapsed', !node.get('collapsed')));
    return stahp(ev);
  },
  onEditorKeyDown(ev) {
    switch (ev.key) {
      case 'Tab':
        if (ev.shiftKey) {
          return this.onEditorShiftTabKeyDown(ev);
        } else {
          return this.onEditorTabKeyDown(ev);
        }
    }
  },
  onEditorShiftTabKeyDown(ev) {
    const { dispatch, path } = this.props;
    // On Shift-Tab, move the node to after its parent.
    var parentPath = splitPath(path).slice(0, -2).join('.');
    if (parentPath) {
      this.editorCommit();
      dispatch(moveNode(path, parentPath, moveNode.positions.AFTER));
    }
    return stahp(ev);
  },
  onEditorTabKeyDown(ev) {
    const { dispatch, siblings, path } = this.props;
    // On Tab, adopt the node as last child of previous sibling.
    var parts = splitPath(path);
    var index = parseInt(parts.pop());
    if (index - 1 >= 0) {
      var newPath = parts.concat([index - 1]).join('.');
      this.editorCommit();
      dispatch(moveNode(path, newPath, moveNode.positions.ADOPT_LAST));
      dispatch(clearSelection());
    }
    return stahp(ev);
  },
  onEditorKeyUp(ev) {
    const { dispatch, root, nodes, path } = this.props;
    switch (ev.key) {
      case 'ArrowUp':
        this.editorCommit();
        dispatch(selectNode(getPreviousNodePath(root, path)));
        return stahp(ev);
      case 'ArrowDown':
        this.editorCommit();
        dispatch(selectNode(getNextNodePath(root, path)));
        return stahp(ev);
      case 'Enter':
        this.editorCommit();
        dispatch(selectNode(getNextNodePath(root, path)));
        // TODO: Create a new item as next sibling
        return stahp(ev);
    }
  },
  onEditorChange(ev) {
    this.setState({ editorValue: ev.target.value });
  },
  onEditorBlur(ev) {
    const { dispatch, path } = this.props;
    this.editorCommit();
    dispatch(clearSelection());
  },
  editorCommit() {
    const { dispatch, node, path } = this.props;
    const { editorValue } = this.state;
    if (this.state.editorValue !== this.props.node.get('title')) {
      dispatch(setNodeAttribute(path, 'title', editorValue));
    }
  },
  onDragStart(ev) {
    const { path, node } = this.props;
    setDragMeta(ev, {path});
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({ path }));
    ev.stopPropagation();
    this.setState({ dragging: true });
  },
  onDragEnter(ev) {
    const { path: draggedPath } = getDragMeta(ev);
    if (draggedPath != this.props.path) {
      ev.dataTransfer.dropEffect = 'move';
    }
    return stahp(ev);
  },
  onDragOver(ev) {
    const { path: draggedPath } = getDragMeta(ev);
    // Ensure the drop target is not the dragged node or a child
    if (this.props.path.indexOf(draggedPath) !== 0) {
      const rect = ev.target.getBoundingClientRect();
      // TODO: Get rid of the magic number here for defining the zone width
      // that defines whether the drop will be an adoption or before/after
      const pos = (ev.clientX > (rect.left + 50)) ? 'ADOPT' :
                  (ev.clientY < (rect.top + rect.height / 2)) ? 'BEFORE' :
                  'AFTER';
      this.setState({ positionPreview: moveNode.positions[pos] });
    }
    return stahp(ev);
  },
  onDragLeave(ev) {
    this.setState({ positionPreview: null });
    return stahp(ev);
  },
  onDragEnd(ev) {
    this.setState({ dragging: false });
    return stahp(ev);
  },
  onDrop(ev) {
    const { dispatch } = this.props;
    // TODO: Accept drops from outside the browser.
    const { path: draggedPath } = getDragMeta(ev);
    const data = JSON.parse(ev.dataTransfer.getData('text'));
    // Ensure the drop target is not the dragged node or a child
    if (this.props.path.indexOf(draggedPath) !== 0) {
      dispatch(moveNode(data.path, this.props.path, this.state.positionPreview))
    }
    this.setState({ positionPreview: null });
    return stahp(ev);
  }
});

function stahp(ev) {
  ev.stopPropagation();
  ev.preventDefault();
}

// HACK: Encode data in type names to circumvent dataTransfer protected mode
// http://www.w3.org/TR/2011/WD-html5-20110113/dnd.html#concept-dnd-p
function setDragMeta(ev, data) {
  Object.keys(data).forEach(key => {
    ev.dataTransfer.setData('x-meta/' + key + '/' + data[key], data[key]);
  });
}

// HACK: Decode data from type names to circumvent dataTransfer protected mode
// http://www.w3.org/TR/2011/WD-html5-20110113/dnd.html#concept-dnd-p
function getDragMeta(ev) {
  const data = {};
  const types = ev.dataTransfer.types;
  for (let i = 0; i < types.length; i++) {
    const parts = types[i].split('/');
    if (parts[0] == 'x-meta') {
      data[parts[1]] = parts[2];
    }
  }
  return data;
}

// https://davidwalsh.name/caret-end
function moveCursorToEnd(el) {
  if (!el) { return; }
  if (typeof el.selectionStart == "number") {
    el.selectionStart = el.selectionEnd = el.value.length;
  } else if (typeof el.createTextRange != "undefined") {
    el.focus();
    var range = el.createTextRange();
    range.collapse(false);
    range.select();
  }
}
