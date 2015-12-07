import React, { Component, PropTypes } from 'react';
import ReactDOM from 'react-dom';
import { connect } from 'react-redux';
import classNames from 'classnames';

import * as actions from './actions';
import { getNextNodePath, getPreviousNodePath } from './utils';

export const Outline = connect(state => {
  return { nodes: state.nodes };
})(React.createClass({
  getInitialState() {
    return {
      selected: null,
      editing: null
    };
  },
  render() {
    const { dispatch, nodes } = this.props;
    const root = {
      getState: (name) => this.state[name],
      setState: (data) => this.setState(data),
      selectPrevious: (path) => {
        const newPath = getPreviousNodePath(nodes, path);
        if (newPath) {
          this.setState({ selection: newPath, editing: newPath });
        }
      },
      selectNext: (path) => {
        const newPath = getNextNodePath(nodes, path);
        if (newPath) {
          this.setState({ selection: newPath, editing: newPath });
        }
      }
    };
    return (
      <OutlineTree path="" dispatch={dispatch} nodes={nodes.toJS()} root={root} />
    );
  }
}));

export const OutlineTree = ({ dispatch, nodes, root, path }) =>
  <ul className="outline">
    {nodes.map((node, index) =>
      <OutlineNode dispatch={dispatch} root={root}
                   node={node} key={index} index={index}
                   path={path + index} />
    )}
  </ul>;

export const OutlineNode = React.createClass({
  getInitialState() {
    return {
      editorValue: this.props.node.title,
      dragging: false,
      positionPreview: null
    };
  },
  render() {
    const { dispatch, node, path, root } = this.props;
    const { positionPreview, editorValue, dragging } = this.state;

    // HACK: Disable dragging when any node is edited.
    // On Firefox, input fields don't receive mouse clicks
    // when a parent has draggable=true
    //
    // https://bugzilla.mozilla.org/show_bug.cgi?id=800050
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1189486
    const selected = root.getState('selection') === path;
    const editing = root.getState('editing') === path;
    const draggable = !editing;

    return (
      <li className={classNames({
            'outline-node': true,
            'editing': editing,
            'dragging': dragging,
            'selected': selected,
            'has-children': !!node.children,
            'collapsed': !!node.collapsed,
            'position-preview-adopt':
              positionPreview == actions.MovePositions.ADOPT,
            'position-preview-before':
              positionPreview == actions.MovePositions.BEFORE,
            'position-preview-after':
              positionPreview == actions.MovePositions.AFTER,
          })}
          draggable={draggable}
          onDragStart={this.onDragStart}
          onDragEnter={this.onDragEnter}
          onDragOver={this.onDragOver}
          onDragLeave={this.onDragLeave}
          onDragEnd={this.onDragEnd}
          onDrop={this.onDrop}>

        <div className="content">

          <button className="collapse"
                  disabled={!node.children}
                  onClick={this.onToggleCollapsed}>
            &nbsp;
          </button>

          {!selected ? null :
            <button className="delete"
                    onClick={this.onDelete}>X</button>}

          {selected && editing ?
            <input className="editor"
                   autoFocus={true}
                   ref={moveCursorToEnd}
                   type="text"
                   size="50"
                   value={editorValue}
                   onKeyUp={this.onEditorKeyUp}
                   onBlur={this.onEditorBlur}
                   onChange={this.onEditorChange} />
            :
            <span className="title"
                  onClick={this.onSelectionClick}
                  onDoubleClick={this.onTitleDoubleClick}>{node.title}</span>}

        </div>

        {!node.collapsed && node.children &&
          <OutlineTree dispatch={dispatch} root={root}
                       path={path + '.children.'} nodes={node.children} />}

      </li>
    );
  },
  setEditing(isEditing) {
    const { root, path } = this.props;
    if (isEditing) {
      // HACK: Track editing on the root state, so we can disable all dragging
      root.setState({ editing: path, selection: path });
    } else {
      root.setState({ editing: null, selection: null });
    }
  },
  onSelectionClick(ev) {
    this.props.root.setState({ selection: this.props.path });
  },
  onTitleDoubleClick(ev) {
    this.editorStart();
  },
  onEditorKeyUp(ev) {
    const { root, path } = this.props;
    switch (ev.key) {
      case 'Escape':
        stahp(ev);
        return this.editorCancel();
      case 'Enter':
        stahp(ev);
        return this.editorCommit();
      case 'ArrowUp':
        root.selectPrevious(path);
        return stahp(ev);
      case 'ArrowDown':
        root.selectNext(path);
        return stahp(ev);
    }
  },
  onEditorChange(ev) {
    this.setState({ editorValue: ev.target.value });
  },
  onEditorBlur(ev) {
    this.editorCommit();
  },
  editorStart() {
    this.setState({ editorValue: this.props.node.title });
    this.setEditing(true);
  },
  editorCancel() {
    this.setEditing(false);
  },
  editorCommit() {
    const { dispatch, node, path } = this.props;
    if (this.state.editorValue !== this.props.node.title) {
      dispatch(actions.setNodeAttribute(
        path, 'title', this.state.editorValue));
    }
    this.setEditing(false);
  },
  onDragStart(ev) {
    const { path, node } = this.props;
    setDragMeta(ev, {path});
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({path, node}));
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
      this.setState({ positionPreview: actions.MovePositions[pos] });
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
      dispatch(actions.moveNode(data.path, this.props.path,
                                this.state.positionPreview));
    }
    this.setState({ positionPreview: null });
    return stahp(ev);
  },
  onDelete(ev) {
    const { dispatch } = this.props;
    dispatch(actions.deleteNode(this.props.path))
    return stahp(ev);
  },
  onToggleCollapsed(ev) {
    const { dispatch, node, path } = this.props;
    dispatch(actions.setNodeAttribute(path, 'collapsed', !node.collapsed ));
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
