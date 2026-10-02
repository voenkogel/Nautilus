import { Disclosure } from './ui/Disclosure';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Save, Trash2, GitBranch, Plus } from 'lucide-react';
import type { AppearanceConfig, TreeNode } from '../types/config';
import { NodeFormFields } from './NodeFormFields';
import { ConfirmDialog } from './ConfirmDialog';

export function InspectorEditor({ node, appearance, onSave, onCancel, onAddChild, onDelete, children }: {
  node: TreeNode;
  appearance: AppearanceConfig;
  onSave: (node: TreeNode) => Promise<void>;
  onCancel: () => void;
  onAddChild: () => void;
  onDelete: (keepChildren: boolean) => Promise<void>;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState(() => structuredClone(node));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keepChildren, setKeepChildren] = useState(true);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(node);
  useEffect(() => { content.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
  useEffect(() => {
    if (confirmDelete) content.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [confirmDelete]);
  function cancel() {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onCancel();
  }
  async function save() {
    if (!draft.title.trim()) { setError('Give this node a title before saving.'); return; }
    setSaving(true); setError('');
    try { await onSave(draft); onCancel(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save. Your changes are still here.'); }
    finally { setSaving(false); }
  }
  function returnToEditing() { if (!saving) { setConfirmDelete(false); setError(''); } }
  async function remove() {
    setSaving(true); setError('');
    try { await onDelete(!!node.children?.length && keepChildren); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this node.'); }
    finally { setSaving(false); }
  }
  const countChildren = (nodes: TreeNode[]): number => nodes.reduce((sum, child) => sum + 1 + countChildren(child.children ?? []), 0);
  const descendantCount = countChildren(node.children ?? []);
  if (confirmDelete) return <div className="inspector-editor deletion-view" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); returnToEditing(); }
  }}>
    <header className="inspector-editor-heading"><button aria-label="Back to editing" onClick={returnToEditing} disabled={saving}><ArrowLeft size={18} /></button><div><h2>Remove from network</h2></div></header>
    <div className="inspector-editor-content deletion-content" ref={content}>
      <span className="deletion-symbol"><Trash2 size={24} strokeWidth={1.4} /></span>
      <h2 tabIndex={-1}>{node.title}</h2>
      <p className="deletion-intro">{descendantCount ? `This node connects ${descendantCount} other ${descendantCount === 1 ? 'node' : 'nodes'}. Choose what happens to them.` : 'Remove this node and its connection from your network.'}</p>
      {descendantCount > 0 && <fieldset className="deletion-options" disabled={saving}>
        <legend>Connected nodes</legend>
        <label className={`deletion-option ${keepChildren ? 'chosen' : ''}`}>
          <input type="radio" name="delete-scope" checked={keepChildren} onChange={() => setKeepChildren(true)} />
          <span><strong>Keep connected nodes</strong><small>Move them up one level. Their settings and connections stay intact.</small></span>
          <GitBranch size={19} />
        </label>
        <label className={`deletion-option destructive ${!keepChildren ? 'chosen' : ''}`}>
          <input type="radio" name="delete-scope" checked={!keepChildren} onChange={() => setKeepChildren(false)} />
          <span><strong>Delete the entire branch</strong><small>Remove this node and all {descendantCount} connected {descendantCount === 1 ? 'node' : 'nodes'}.</small></span>
          <Trash2 size={18} />
        </label>
      </fieldset>}
    </div>
    <footer className="inspector-editor-footer deletion-footer">
      {error && <p role="alert">{error}</p>}
      <p className="deletion-consequence">{descendantCount && !keepChildren ? `${descendantCount + 1} nodes` : '1 node'} will be deleted. This cannot be undone.</p>
      <div><button onClick={returnToEditing} disabled={saving}>Keep editing</button><button className="delete-confirm-button" onClick={() => void remove()} disabled={saving}>{saving ? 'Deleting...' : descendantCount && !keepChildren ? 'Delete branch' : 'Delete node'}</button></div>
    </footer>
  </div>;
  return <div className="inspector-editor" onKeyDown={event => {
    if (event.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) { event.stopPropagation(); cancel(); }
  }}>
    <header className="inspector-editor-heading"><button aria-label="Back to node details" onClick={cancel} disabled={saving}><ArrowLeft size={18} /></button><div><h2>Edit node</h2><p>{node.title}</p></div><span>{dirty ? 'Unsaved changes' : 'Node settings'}</span></header>
    <div className="inspector-editor-content" ref={content}>
      <fieldset disabled={saving}>
        <NodeFormFields node={draft} onChange={updates => setDraft(previous => ({ ...previous, ...updates }))} appearance={appearance} />
        <Disclosure title="Position in network">{children}</Disclosure>
        <button type="button" className="wide-action editor-add-child" onClick={onAddChild}>Add child node<Plus size={14} /></button>

      </fieldset>
    </div>
    <footer className="inspector-editor-footer">
      {error && <p role="alert">{error}</p>}
      <div><button className="editor-delete-entry" title="Delete node" aria-label="Delete node" onClick={() => { setError(''); setConfirmDelete(true); }} disabled={saving}><Trash2 size={17} /></button><button onClick={cancel} disabled={saving}>Cancel</button><button className="primary-action" onClick={() => void save()} disabled={saving}><Save size={15} />{saving ? 'Saving...' : 'Save'}</button></div>
    </footer>
    {confirmDiscard && <ConfirmDialog isOpen title="Discard unsaved changes?" message="Your edits have not been saved. Return to the node details without applying them?" confirmLabel="Discard changes" cancelLabel="Keep editing" onConfirm={onCancel} onCancel={() => setConfirmDiscard(false)} />}
  </div>;
}
