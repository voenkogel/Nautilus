import { HomeConstellation } from './HomeConstellation';
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Activity, ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleDot, Clock3, Compass, Crosshair, Edit3, ExternalLink, Film, Gamepad2, History, List, Minus, Network, Plus, RefreshCw, Search, Settings, X } from 'lucide-react';
import type { AppConfig, NodeStatus, TreeNode } from '../types/config';
import { activity, matchesNode, summarize, healthDescription, healthStates } from '../utils/networkSummary';
import type { NetworkFilter } from '../utils/networkSummary';
import { radialLayout, radialPath, overviewFolds, HUB_ID } from '../utils/radialLayout';
import type { RadialLayout } from '../utils/radialLayout';
import { getAllNodes, getNodeTargetUrl, isNodeMonitored, getNodeSiblingPosition } from '../utils/nodeUtils';
import { iconRegistry } from '../utils/iconUtils';
import { getStatusColor, statusLabels } from '../utils/colors';
import { assetUrl } from '../utils/assetUrl';
import { NodeHistoryView } from './history/NodeHistoryView';
import { PeriodPicker } from './history/historyCharts';
import type { HistoryPeriod } from '../hooks/useStatusHistory';
import { HealthRing, NetworkHealth } from './HealthRing';
import { InspectorEditor } from './InspectorEditor';
import { useDeviceDetection } from '../hooks/useDeviceDetection';

interface Props {
  config: AppConfig;
  statuses: Record<string, NodeStatus>;
  connected: boolean;
  loading: boolean;
  querying: boolean;
  countdown: number;
  error: string | null;
  collapsed: Set<string>;
  editMode: boolean;
  onCollapse: (id: string, collapsed: boolean) => void;
  onEditMode: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onRefresh: () => void;
  onOpen: (node: TreeNode) => void;
  onEdit: (id: string) => Promise<TreeNode | null>;
  onSaveNode: (node: TreeNode) => Promise<void>;
  onAdd: (id: string) => void;
  onDelete: (id: string, keepChildren: boolean) => Promise<void>;
  onMove: (id: string, parent: string | null, index: number) => Promise<void>;
  onOrder: (id: string, direction: 'up' | 'down') => void;
  empty: React.ReactNode;
}
type Camera = { x: number; y: number; scale: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function statusText(node: TreeNode, status?: NodeStatus) {
  return !isNodeMonitored(node) ? 'Unmonitored' : status ? statusLabels[status.status] : 'Awaiting status';
}
function elapsed(value?: string) {
  if (!value) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
const NodeIcon = memo(function NodeIcon({ node }: { node: TreeNode | null }) {
  const key = (node?.icon || 'server').split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const Icon = iconRegistry[key] ?? iconRegistry.Server;
  return node ? <span className="node-symbol" aria-hidden="true"><Icon size={24} /></span> : <Network size={30} />;
});

function HomeOrb({ summary, connected, filter, onFilter }: { summary: ReturnType<typeof summarize>; connected: boolean; filter: NetworkFilter; onFilter: (filter: NetworkFilter) => void }) {
  const status = !connected ? 'Reconnecting' : summary.offline ? 'Needs attention' : summary.checking ? 'Checking services' : summary.backup ? 'Backup in progress' : summary.unknown ? 'Awaiting readings' : summary.monitored ? 'All systems connected' : 'Ready to connect';
  return <span className={`home-orb ${!connected ? 'disconnected' : ''} ${summary.offline ? 'has-outage' : ''}`}>
    <HomeConstellation active={connected} />
    <span className="orb-content">
      <span className="orb-title">Home lab</span>
      <span className="orb-status">{status}</span>
      <span className="orb-indicators">
        {healthStates.filter(state => summary[state.key] > 0).map(state => <button className="orb-indicator" key={state.key} aria-label={`${summary[state.key]} ${state.label.toLowerCase()}`} aria-pressed={filter === state.key} title={`${summary[state.key]} ${state.label.toLowerCase()}: ${filter === state.key ? 'Clear filter' : 'Show services'}`} onClick={() => onFilter(filter === state.key ? null : state.key)}>
          <i style={{ background: state.color }} /><strong>{summary[state.key]}</strong><span>{state.key === 'unknown' ? 'Awaiting' : state.key === 'backup' ? 'Backup' : state.label}</span>
        </button>)}
      </span>
    </span>
  </span>;
}

/** One interpolation clock keeps nodes and curved connections together, including exits. */
function useAnimatedLayout(layout: RadialLayout) {
  const [frame, setFrame] = useState(layout);
  const current = useRef(layout);
  useLayoutEffect(() => {
    const previous = current.current;
    const starts = new Map(previous.nodes.map(n => [n.id, n]));
    const targets = new Map(layout.nodes.map(n => [n.id, n]));
    const all = [...layout.nodes, ...previous.nodes.filter(n => !targets.has(n.id))];
    const links = [...layout.links, ...previous.links.filter(l => !layout.links.some(t => t.to === l.to))];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    let request = 0;
    const tick = (now: number) => {
      const t = reduced ? 1 : clamp((now - started) / 320, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const nodes = all.map(n => {
        const from = starts.get(n.id) ?? starts.get(n.parentId ?? '') ?? targets.get(n.parentId ?? '') ?? n;
        let to = targets.get(n.id);
        let parent = n.parentId;
        while (!to && parent) { to = targets.get(parent); parent = starts.get(parent)?.parentId ?? null; }
        to ??= layout.nodes[0] ?? n;
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        const startOpacity = starts.get(n.id)?.opacity ?? (starts.has(n.id) ? 1 : 0);
        const endOpacity = targets.has(n.id) ? 1 : 0;
        return { ...n, x, y, radius: Math.hypot(x, y), angle: Math.atan2(y, x), opacity: startOpacity + (endOpacity - startOpacity) * eased };
      });
      const next = t === 1 ? layout : { ...layout, nodes, links };
      current.current = next;
      setFrame(next);
      if (t < 1) request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [layout]);
  return frame;
}

/** Camera-locked canvas texture: the dot grid and hub glow pan and zoom with the map. */
function stageBackground(camera: Camera): CSSProperties {
  let grid = 28 * camera.scale;
  while (grid < 18) grid *= 2;
  while (grid > 40) grid /= 2;
  return { '--grid': `${grid}px`, '--cam-x': `${camera.x}px`, '--cam-y': `${camera.y}px`, '--glow': `${clamp(640 * camera.scale, 260, 1100)}px` } as CSSProperties;
}

export default function RadialDashboard(props: Props) {
  const { config, statuses, collapsed } = props;
  const { isMobile } = useDeviceDetection();
  const editMode = props.editMode && !isMobile;
  const [view, setView] = useState<'map' | 'list' | null>(null);
  const isList = view ? view === 'list' : isMobile;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorNode, setEditorNode] = useState<TreeNode | null>(null);
  const [openingEditor, setOpeningEditor] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  const [filter, setFilter] = useState<NetworkFilter>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [automaticFolds, setAutomaticFolds] = useState<Set<string>>(new Set());
  const [explicitFolds, setExplicitFolds] = useState<Map<string, boolean>>(new Map());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  const [period, setPeriod] = useState<HistoryPeriod>('7d');
  const [moveParent, setMoveParent] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [cameraAnimated, setCameraAnimated] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLElement>(null);
  // Mobile inspector is a bottom sheet: drag the handle up to expand, down to collapse or dismiss.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetStyle, setSheetStyle] = useState<CSSProperties | null>(null);
  const sheetDrag = useRef<{ id: number; y: number; height: number; dy: number; active: boolean } | null>(null);
  const savedCamera = useRef<Camera | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; distance: number; camera: Camera } | null>(null);
  const didPan = useRef(false);
  const all = useMemo(() => getAllNodes(config.tree.nodes), [config.tree.nodes]);
  const byId = useMemo(() => new Map(all.map(n => [n.id, n])), [all]);
  const parents = useMemo(() => {
    const map = new Map<string, string | null>();
    const walk = (nodes: TreeNode[], parent: string | null) => nodes.forEach(n => { map.set(n.id, parent); walk(n.children ?? [], n.id); });
    walk(config.tree.nodes, null);
    return map;
  }, [config.tree.nodes]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const summary = useMemo(() => summarize(config.tree.nodes, statuses), [config.tree.nodes, statuses]);
  useEffect(() => { if (filter === 'activity' && summary.streams + summary.players === 0) setFilter(null); }, [filter, summary.streams, summary.players]);
  const roots = useMemo(() => focusId && byId.has(focusId) ? [byId.get(focusId)!] : config.tree.nodes, [focusId, byId, config.tree.nodes]);
  const effectiveCollapsed = useMemo(() => {
    const result = new Set(collapsed);
    if (!showAll && !focusId) automaticFolds.forEach(id => result.add(id));
    revealed.forEach(id => result.delete(id));
    explicitFolds.forEach((folded, id) => folded ? result.add(id) : result.delete(id));
    return result;
  }, [collapsed, automaticFolds, showAll, focusId, revealed, explicitFolds]);
  const layout = useMemo(() => radialLayout(roots, effectiveCollapsed), [roots, effectiveCollapsed]);
  const frame = useAnimatedLayout(layout);
  const frameById = useMemo(() => new Map(frame.nodes.map(n => [n.id, n])), [frame.nodes]);
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);
  const branchLeave = useRef<number | undefined>(undefined);
  const showBranch = (id: string) => { window.clearTimeout(branchLeave.current); setHoveredBranch(id); };
  const hideBranch = () => { window.clearTimeout(branchLeave.current); branchLeave.current = window.setTimeout(() => setHoveredBranch(null), 160); };
  useEffect(() => () => window.clearTimeout(branchLeave.current), []);
  const hasFilter = !!(query.trim() || filter);
  const matches = useMemo(() => all.filter(n => matchesNode(n, statuses, filter, query)), [all, statuses, filter, query]);
  const matchedIds = useMemo(() => new Set(matches.map(n => n.id)), [matches]);
  const relevant = useMemo(() => {
    const ids = new Set<string>([HUB_ID]);
    matches.forEach(n => { let id: string | null = n.id; while (id) { ids.add(id); id = parents.get(id) ?? null; } });
    return ids;
  }, [matches, parents]);
  const activePath = useMemo(() => {
    const ids = new Set<string>([HUB_ID]);
    let id = hoveredId ?? selectedId;
    while (id) { ids.add(id); id = parents.get(id) ?? null; }
    return ids;
  }, [selectedId, hoveredId, parents]);
  const branchStats = useMemo(() => new Map(all.map(n => [n.id, summarize(n.children ?? [], statuses)])), [all, statuses]);

  const changeCamera = useCallback((next: Camera, animated = true) => { setCameraAnimated(animated); setCamera(next); }, []);
  const fit = useCallback((target = layout, animated = true) => {
    if (!stage.current) return;
    const { width, height } = stage.current.getBoundingClientRect();
    const b = target.bounds;
    const usable = width - (selectedId && width > 1050 ? 380 : 0);
    const scale = clamp(Math.min((usable - 80) / (b.right - b.left), (height - 130) / (b.bottom - b.top)), .08, 1.15);
    changeCamera({ x: usable / 2 - (b.left + b.right) * scale / 2, y: height / 2 - (b.top + b.bottom) * scale / 2, scale }, animated);
  }, [layout, selectedId, changeCamera]);
  const initialized = useRef(false);
  const overviewInitialized = useRef(false);
  useLayoutEffect(() => {
    if (all.length && !overviewInitialized.current && stage.current) {
      overviewInitialized.current = true;
      const folds = overviewFolds(config.tree.nodes, collapsed, stage.current.clientWidth, stage.current.clientHeight);
      setAutomaticFolds(folds);
      if (!isList) {
        fit(radialLayout(roots, new Set([...collapsed, ...folds])), false);
        initialized.current = true;
      }
      return;
    }
    if (all.length && !initialized.current && !isList) { fit(layout, false); initialized.current = true; }
  }, [layout, isList, config.tree.nodes, collapsed, fit, roots, all.length]);
  useEffect(() => {
    if (!stage.current) return;
    const element = stage.current;
    let previousWidth = element.clientWidth;
    let previousHeight = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const dx = (element.clientWidth - previousWidth) / 2;
      const dy = (element.clientHeight - previousHeight) / 2;
      previousWidth = element.clientWidth;
      previousHeight = element.clientHeight;
      if (initialized.current && (dx || dy)) setCamera(c => ({ ...c, x: c.x + dx, y: c.y + dy }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isList]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHoveredId(null);
        setSearchOpen(false);
        if (document.querySelector('[aria-modal="true"], .inspector-editor')) return;
        setSelectedId(null);
        if (selectedId) document.querySelector<HTMLButtonElement>(`[data-select-node="${CSS.escape(selectedId)}"]`)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);
  useEffect(() => { setRevealed(new Set()); }, [query, filter]);
  useEffect(() => {
    if (selectedId && !byId.has(selectedId)) { setSelectedId(null); setEditorNode(null); }
    if (focusId && !byId.has(focusId)) { setFocusId(null); savedCamera.current = null; }
  }, [byId, selectedId, focusId]);
  useEffect(() => {
    if (!selectedId) return;
    setMoveParent(parents.get(selectedId) ?? '');
    setMoveError('');
    inspector.current?.focus();
  }, [selectedId, parents]); // Updating telemetry must not steal focus.

  function select(node: TreeNode, reveal = false) {
    if (didPan.current || editorNode) return;
    if (reveal) {
      const ancestors = new Set<string>();
      let parent = parents.get(node.id);
      while (parent) { ancestors.add(parent); parent = parents.get(parent); }
      setRevealed(ancestors);
      setExplicitFolds(previous => { const next = new Map(previous); ancestors.forEach(id => next.delete(id)); return next; });
      if (focusId && !getAllNodes(roots).some(n => n.id === node.id)) setFocusId(null);
      const expanded = new Set(effectiveCollapsed);
      ancestors.forEach(id => expanded.delete(id));
      const next = radialLayout(config.tree.nodes, expanded).nodes.find(n => n.id === node.id);
      if (next && stage.current) changeCamera({ ...camera, x: Math.max(150, (stage.current.clientWidth - (isMobile ? 0 : 380)) / 2) - next.x * camera.scale, y: stage.current.clientHeight / 2 - next.y * camera.scale });
    } else {
      const position = layout.nodes.find(n => n.id === node.id);
      if (position && stage.current && !isMobile) {
        const screenX = position.x * camera.scale + camera.x;
        const limit = stage.current.clientWidth - 440;
        if (screenX > limit) changeCamera({ ...camera, x: camera.x - (screenX - limit) });
      }
    }
    setSelectedId(node.id); setTab('overview'); setHoveredId(null);
  }
  function toggleFold(node: TreeNode) {
    const folded = !effectiveCollapsed.has(node.id);
    setExplicitFolds(previous => new Map(previous).set(node.id, folded));
    props.onCollapse(node.id, folded);
  }
  function returnToNetwork() {
    setFocusId(null);
    if (savedCamera.current) changeCamera(savedCamera.current);
    savedCamera.current = null;
  }
  const zoom = useCallback((factor: number, x?: number, y?: number) => {
    if (!stage.current) return;
    const c = cameraRef.current;
    const centerX = x ?? stage.current.clientWidth / 2;
    const centerY = y ?? stage.current.clientHeight / 2;
    const scale = clamp(c.scale * factor, .08, 2.5);
    changeCamera({ x: centerX - (centerX - c.x) * scale / c.scale, y: centerY - (centerY - c.y) * scale / c.scale, scale }, false);
  }, [changeCamera]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('button,aside,input')) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [isList, zoom]);
  function startGesture(event: ReactPointerEvent) {
    const target = event.target as HTMLElement;
    // Nodes pan the canvas too, except in edit mode where dragging a node reparents it.
    const onNode = !editMode && !!target.closest('.radial-node') && !target.closest('input,select,textarea,a,[contenteditable]');
    if (event.button !== 0 || (!onNode && target.closest('button,aside,input,select,textarea,a,[contenteditable]'))) return;
    if (!onNode) {
      event.preventDefault();
      event.currentTarget.classList.add('is-panning');
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    resetGesture(); didPan.current = false;
  }
  function resetGesture() {
    const points = [...pointers.current.values()];
    if (!points.length) { gesture.current = null; return; }
    const a = points[0], b = points[1] ?? a;
    gesture.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), camera: cameraRef.current };
  }
  function moveGesture(event: ReactPointerEvent) {
    if (!pointers.current.has(event.pointerId) || !gesture.current || !stage.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()], a = points[0], b = points[1] ?? a;
    const g = gesture.current, rect = stage.current.getBoundingClientRect();
    const dx = (a.x + b.x) / 2 - g.x, dy = (a.y + b.y) / 2 - g.y;
    if (Math.hypot(dx, dy) > 4 || points.length > 1) didPan.current = true;
    // A press that began on a node only takes over the pointer once it moves; until then it stays a click.
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      if (!didPan.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('is-panning');
    }
    const scale = clamp(g.camera.scale * (g.distance ? Math.hypot(a.x - b.x, a.y - b.y) / g.distance : 1), .08, 2.5);
    const ratio = scale / g.camera.scale;
    changeCamera({ x: g.x - rect.left - (g.x - rect.left - g.camera.x) * ratio + dx, y: g.y - rect.top - (g.y - rect.top - g.camera.y) * ratio + dy, scale }, false);
  }
  function endGesture(event: ReactPointerEvent) { pointers.current.delete(event.pointerId); if (!pointers.current.size) event.currentTarget.classList.remove('is-panning'); resetGesture(); setTimeout(() => { didPan.current = false; }, 0); }
  async function moveNode(id: string, parent: string | null) {
    const node = byId.get(id);
    if (!node || parent === id || getAllNodes(node.children ?? []).some(n => n.id === parent)) return;
    setMoving(true); setMoveError('');
    try { await props.onMove(id, parent, parent ? byId.get(parent)?.children?.length ?? 0 : config.tree.nodes.length); }
    catch (error) { setMoveError(error instanceof Error ? error.message : 'Could not move node. Try again.'); }
    finally { setMoving(false); setDragged(null); setDropId(null); }
  }
  useEffect(() => { setSheetExpanded(false); setSheetStyle(null); }, [selectedId]);
  function closeInspector() {
    const id = selectedId;
    setSelectedId(null);
    if (id) document.querySelector<HTMLButtonElement>(`[data-select-node="${CSS.escape(id)}"]`)?.focus();
  }
  function sheetDown(event: ReactPointerEvent<HTMLElement>) {
    if (!isMobile || event.button !== 0 || !inspector.current) return;
    sheetDrag.current = { id: event.pointerId, y: event.clientY, height: inspector.current.getBoundingClientRect().height, dy: 0, active: false };
  }
  function sheetMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = sheetDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    drag.dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(drag.dy) < 6) return;
      drag.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    // Upward grows the sheet toward full height; downward slides it away.
    setSheetStyle(drag.dy < 0
      ? { maxHeight: 'none', height: Math.min(drag.height - drag.dy, window.innerHeight * .92), transition: 'none' }
      : { transform: `translateY(${drag.dy}px)`, transition: 'none' });
  }
  function sheetUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = sheetDrag.current;
    sheetDrag.current = null;
    if (!drag?.active || drag.id !== event.pointerId) return;
    if (drag.dy < -40) { setSheetExpanded(true); setSheetStyle(null); }
    else if (drag.dy > 80 && sheetExpanded) { setSheetExpanded(false); setSheetStyle(null); }
    else if (drag.dy > 80) { setSheetStyle({ transform: 'translateY(100%)' }); setTimeout(closeInspector, 220); }
    else setSheetStyle(null);
  }

  async function beginEdit(node: TreeNode) {
    setOpeningEditor(true); setEditorError('');
    try { const editable = await props.onEdit(node.id); if (editable) setEditorNode(editable); }
    catch (error) { setEditorError(error instanceof Error ? error.message : 'Could not load node settings.'); }
    finally { setOpeningEditor(false); }
  }
  function finishEdit() {
    setEditorNode(null);
    requestAnimationFrame(() => inspector.current?.querySelector<HTMLButtonElement>('.inspector-edit-button')?.focus());
  }
  const hovered = hoveredId ? byId.get(hoveredId) : undefined;
  const hoverPosition = frame.nodes.find(n => n.id === hoveredId);
  const selectedStatus = selected ? statuses[selected.id] : undefined;
  const lastChecked = Object.values(statuses).map(s => s.lastChecked).sort().at(-1);
  const ancestorNames: TreeNode[] = [];
  let ancestor = focusId ? parents.get(focusId) : null;
  while (ancestor) { const n = byId.get(ancestor); if (n) ancestorNames.unshift(n); ancestor = parents.get(ancestor); }

  const renderList = (nodes: TreeNode[], depth = 0): React.ReactNode => nodes.map(node => {
    const s = statuses[node.id], counts = activity(node, s), stats = branchStats.get(node.id)!;
    if (hasFilter && !relevant.has(node.id)) return null;
    return <Fragment key={node.id}>
      <div className={`network-list-row ${selectedId === node.id ? 'selected' : ''}`} style={{ '--depth': depth } as CSSProperties}>
        <button className="list-fold" aria-label={`${effectiveCollapsed.has(node.id) ? 'Expand' : 'Collapse'} ${node.title}`} disabled={!node.children?.length} onClick={() => toggleFold(node)}>{effectiveCollapsed.has(node.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
        <button className="list-node" data-select-node={node.id} onClick={() => select(node)}>
          <span className="list-node-icon" style={{ color: getStatusColor(s, isNodeMonitored(node)) }}><NodeIcon node={node} /></span>
          <span className="list-identity"><strong>{node.title}</strong><small>{node.subtitle || (parents.get(node.id) ? byId.get(parents.get(node.id)!)?.title : 'Home lab')}{effectiveCollapsed.has(node.id) && stats.total ? ` · ${stats.total} hidden${stats.offline ? ` · ${stats.offline} offline` : ''}` : ''}</small></span>
          <span className="list-health" style={{ color: getStatusColor(s, isNodeMonitored(node)) }}><i className="health-dot" style={{ background: 'currentColor' }} />{statusText(node, s)}</span>
          <span className="list-response">{s?.responseTime != null && isNodeMonitored(node) ? `${s.responseTime} ms` : '\u2014'}</span>
          <span className="list-count">{counts.streams + counts.players > 0 ? <>{counts.streams ? <Film size={14} /> : <Gamepad2 size={14} />}{counts.streams || counts.players}</> : '\u2014'}</span>
        </button>
      </div>
      {!effectiveCollapsed.has(node.id) && renderList(node.children ?? [], depth + 1)}
    </Fragment>;
  });

  return <main className={`nautilus-shell ${editMode ? 'is-edit-mode' : ''}`}>
    <header className={`network-header ${searchOpen ? 'search-open' : ''}`}>
      <a className="network-brand" href="#" onClick={event => { event.preventDefault(); returnToNetwork(); }}>
        {config.appearance.logo || config.appearance.favicon ? <img src={assetUrl(config.appearance.logo || config.appearance.favicon!)} alt="" /> : <span className="brand-mark"><Compass size={25} strokeWidth={1.4} /></span>}
        <span>{config.general.title || 'Nautilus'}<small>Network observatory</small></span>
      </a>
    <section className="monitor-strip" aria-label="Network monitoring">
      <div className="sr-only">{props.loading ? 'Connecting' : props.connected ? 'Live network' : 'Monitoring unavailable'}</div>
      <div className="monitor-metrics">
        {summary.streams + summary.players > 0 && <button aria-pressed={filter === 'activity'} title="Filter nodes with active streams or players" className={`activity-total ${filter === 'activity' ? 'active' : ''}`} onClick={() => setFilter(filter === 'activity' ? null : 'activity')}><span className="activity-chip-label">Activity</span>{summary.streams > 0 && <><Film size={14} /><strong>{summary.streams}</strong><span>{summary.streams === 1 ? 'stream' : 'streams'}</span></>}{summary.players > 0 && <><Gamepad2 size={15} /><strong>{summary.players}</strong><span>{summary.players === 1 ? 'player' : 'players'}</span></>}</button>}
      </div>
      <button className="refresh-status" onClick={props.onRefresh} title={`Last update: ${elapsed(lastChecked)}. Refresh status.`} aria-label="Refresh status"><RefreshCw size={14} className={props.querying ? 'refreshing' : ''} /><span>{props.querying ? 'Checking' : `${Math.max(0, Math.ceil(props.countdown))}s`}</span></button>
    </section>
      <button className="mobile-search-toggle" aria-label="Search network" aria-expanded={searchOpen} aria-controls="network-search-field" onClick={() => setSearchOpen(v => !v)}><Search size={18} /></button><div id="network-search-field" className="network-search"><Search size={17} /><input ref={searchInput} aria-label="Search network" placeholder="Find a node…" value={query} onChange={e => setQuery(e.target.value)} />{(query || searchOpen) && <button aria-label="Clear search" onClick={() => { setQuery(''); setSearchOpen(false); }}><X size={15} /></button>}</div>
      <nav aria-label="Application"><button aria-label="History" title="History" onClick={props.onHistory}><History size={17} /><span>History</span></button><button aria-label="Settings" title="Settings" onClick={props.onSettings}><Settings size={17} /><span>Settings</span></button></nav>
    </header>
    {(!props.connected && !props.loading || !summary.monitored) && <div className="network-notice" role="status">{!props.connected && !props.loading ? `${props.error || 'Monitoring connection lost'}. Showing last known readings. ` : 'No monitored nodes. Configure a health check to see live status.'}{!props.connected && <button onClick={props.onRefresh}>Retry connection</button>}</div>}
    <div className={`network-stage ${isList ? 'list-stage' : ''} ${cameraAnimated ? 'camera-animated' : ''}`} style={isList ? undefined : stageBackground(camera)} ref={stage} onPointerDown={!isList ? startGesture : undefined} onPointerMove={!isList ? moveGesture : undefined} onPointerUp={endGesture} onPointerCancel={endGesture}>
      {focusId && <div className="branch-navigation"><button aria-label="Network" onClick={returnToNetwork}><ArrowLeft size={15} />Back to network</button><span>{[...ancestorNames.map(n => n.title), byId.get(focusId)?.title].join(' / ')}</span></div>}
      {all.length === 0 ? <div className="network-empty"><div className="empty-home-center root-node"><div className="node-body" role="group" aria-label="Network health"><HomeOrb summary={summary} connected={props.connected} filter={filter} onFilter={setFilter} /></div></div>{props.empty}</div> : isList ? <div className="network-list"><NetworkHealth summary={summary} filter={filter} onFilter={setFilter} /><div className="inventory-columns"><span>Node / hierarchy</span><span>Health</span><span>Response</span><span>Activity</span></div>{renderList(roots)}</div> : <>
        <div data-layout-settled={frame === layout} className={`radial-world ${cameraAnimated ? 'camera-animated' : ''}`} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
          <svg className="radial-connections" width="1" height="1" aria-hidden="true">
            {layout.rings.map((radius, i) => <circle key={i} r={radius} className="depth-ring" />)}
            {frame.links.map(link => { const from = frameById.get(link.from), to = frameById.get(link.to); return from && to ? <path key={link.to} d={radialPath(from, to)} className={`radial-link ${activePath.has(link.to) ? 'traced' : ''} ${hoveredBranch === link.from ? 'branch-hovered' : ''} ${hasFilter && !relevant.has(link.to) ? 'dimmed' : ''}`} /> : null; })}
            {frame.links.map(link => { const from = frameById.get(link.from), to = frameById.get(link.to); return from && to && link.from !== HUB_ID ? <path key={link.to} d={radialPath(from, to)} className="radial-link-hit" onPointerEnter={() => showBranch(link.from)} onPointerLeave={hideBranch} /> : null; })}
          </svg>
          {frame.nodes.map(position => {
            const node = position.node, s = node ? statuses[node.id] : undefined;
            const stats = node ? branchStats.get(node.id) : summary;
            const counts = node ? activity(node, s) : { streams: 0, players: 0 };
            const folded = effectiveCollapsed.has(position.id);
            const matchCount = node && hasFilter ? getAllNodes(node.children ?? []).filter(n => matchedIds.has(n.id)).length : 0;
            const color = node ? getStatusColor(s, isNodeMonitored(node)) : '#65d7e8';
            return <div key={position.id} className={`radial-node ${position.depth === 0 ? 'root-node' : ''} ${selectedId === position.id ? 'selected' : ''} ${hasFilter && !relevant.has(position.id) ? 'dimmed' : ''} ${dropId === position.id ? 'drop-target' : ''}`} style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${clamp(.85 / camera.scale, 1, 2.2)})`, '--node-status': color, opacity: (position.opacity ?? 1) * (hasFilter && !relevant.has(position.id) ? .22 : 1) } as CSSProperties}>
              {!node ? <div className={`node-body home-drop-target ${editMode && dragged ? 'accepts-drop' : ''}`} role="group" aria-label="Network health" data-drop-home onDragOver={event => {
                if (!editMode || !dragged || moving) return;
                event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropId(HUB_ID);
              }} onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropId(null);
              }} onDrop={event => {
                if (!editMode || !dragged || moving) return;
                event.preventDefault(); event.stopPropagation(); void moveNode(dragged, null);
              }}><HomeOrb summary={summary} connected={props.connected} filter={filter} onFilter={setFilter} />{editMode && dragged && <span className="home-drop-label">{dropId === HUB_ID ? 'Release to connect' : 'Drop here to connect'}</span>}</div> : <button className="node-body" data-select-node={position.id} aria-label={`${node?.title ?? 'Home lab'}, ${node ? statusText(node, s) : `${summary.online} online, ${summary.offline} offline`}`} aria-pressed={selectedId === position.id} onClick={() => node ? select(node) : fit()} onMouseEnter={() => setHoveredId(node?.id ?? null)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(node?.id ?? null)} onBlur={() => setHoveredId(null)} draggable={editMode && !!node} onDragStart={event => { if (node) { setDragged(node.id); event.dataTransfer.setData('text/plain', node.id); event.dataTransfer.effectAllowed = 'move'; } }} onDragEnd={() => { setDragged(null); setDropId(null); }} onDragOver={event => { if (editMode && dragged && node && dragged !== node.id && !getAllNodes(byId.get(dragged)?.children ?? []).some(n => n.id === node.id)) { event.preventDefault(); setDropId(node.id); } }} onDragLeave={() => setDropId(null)} onDrop={event => { event.preventDefault(); if (editMode && dragged && node) void moveNode(dragged, node.id); }}>
                <NodeIcon node={node} />
                {node && <svg className={`node-health-ring ${!isNodeMonitored(node) ? 'unmonitored' : s?.status ?? 'unknown'}`} viewBox="0 0 100 100" aria-hidden="true"><circle className="node-ring-track" cx="50" cy="50" r="46" /><circle className="node-ring-value" cx="50" cy="50" r="46" /></svg>}
                {counts.streams + counts.players > 0 && <span key={counts.streams + ':' + counts.players} className="node-activity" aria-label={`${counts.streams || counts.players} ${counts.streams ? 'streams' : 'players'}`}>{counts.streams ? <Film size={10} /> : <Gamepad2 size={11} />}{counts.streams || counts.players}</span>}
              </button>}
              {node && <div className="node-caption"><span className={`node-label ${camera.scale < .4 && position.depth > 1 && !activePath.has(position.id) && s?.status !== 'offline' ? 'distant' : ''}`}>{node.title}</span></div>}
              {node && !!node.children?.length && !folded && <button className={`branch-collapse ${hoveredBranch === node.id ? 'revealed' : ''}`} style={{ '--dx': `${Math.cos(position.angle) * 44}px`, '--dy': `${Math.sin(position.angle) * 44}px` } as CSSProperties} title={stats ? healthDescription(stats) : undefined} aria-expanded="true" aria-label={`Collapse ${node.title}; ${stats?.total} descendants, ${stats?.offline} offline`} onPointerEnter={() => showBranch(node.id)} onPointerLeave={hideBranch} onFocus={() => showBranch(node.id)} onBlur={hideBranch} onClick={() => toggleFold(node)}><Minus size={11} strokeWidth={2.2} /></button>}
              {node && !!node.children?.length && folded && <button className="branch-toggle" title={stats ? healthDescription(stats) : undefined} aria-expanded="false" aria-label={`Expand ${node.title}; ${stats?.total} descendants, ${stats?.offline} offline`} onClick={() => toggleFold(node)}><span className="branch-glyph" aria-hidden="true"><span /><span /></span>{stats && <HealthRing summary={stats} only={['online', 'offline']} />}<span className="branch-count">{stats?.total}</span>{matchCount > 0 && <span className="branch-matches" title={`${matchCount} matches`}><Search size={10} />{matchCount}</span>}</button>}
            </div>;
          })}
        </div>
        {hovered && hoverPosition && !selectedId && !dragged && <div role="tooltip" className="node-preview" style={{ left: clamp(hoverPosition.x * camera.scale + camera.x + 38, 12, (stage.current?.clientWidth ?? 1000) - 232), top: clamp(hoverPosition.y * camera.scale + camera.y - 24, 85, (stage.current?.clientHeight ?? 800) - 110) }}>{(() => {
          const s = statuses[hovered.id];
          const monitored = isNodeMonitored(hovered);
          const { streams, players } = activity(hovered, s);
          const meta = [
            monitored && s?.responseTime != null ? `${s.responseTime} ms` : null,
            monitored && s?.lastChecked ? `checked ${elapsed(s.lastChecked).toLowerCase()}` : null,
            streams > 0 ? `${streams} live streams` : null,
            players > 0 ? `${players} players online` : null,
          ].filter(Boolean);
          return <><div className="node-preview-head"><i style={{ background: getStatusColor(s, monitored) }} /><strong>{hovered.title}</strong><span>{statusText(hovered, s)}</span></div>{hovered.subtitle && <p>{hovered.subtitle}</p>}{meta.length > 0 && <small>{meta.join(' · ')}</small>}</>;
        })()}</div>}
      </>}
      {hasFilter && <aside className="network-results" aria-label="Search results"><div><strong>{matches.length} {matches.length === 1 ? 'match' : 'matches'}{filter && ` · ${filter === 'backup' ? 'backing up' : filter}`}</strong><button aria-label="Clear filters" onClick={() => { setQuery(''); setFilter(null); }}><X size={14} /></button></div>{matches.length ? matches.map(n => <button key={n.id} onClick={() => select(n, true)}><i style={{ background: getStatusColor(statuses[n.id], isNodeMonitored(n)) }} /><span>{n.title}<small>{statusText(n, statuses[n.id])}</small></span><ArrowUpRight size={13} /></button>) : <p>No nodes match. <button onClick={() => { setQuery(''); setFilter(null); }}>Reset filters</button></p>}</aside>}
      <footer className="map-toolbar">
        <div className="view-switch animated-segments" style={{ '--segment-index': isList ? 1 : 0 } as CSSProperties} aria-label="Network view"><button aria-label="Map" title="Map" aria-pressed={!isList} onClick={() => { setView('map'); initialized.current = false; }}><CircleDot size={18} /></button><button aria-label="List" title="List" aria-pressed={isList} onClick={() => setView('list')}><List size={18} /></button></div>
        <div className="viewport-controls">{!isList && <><button aria-label="Zoom out" onClick={() => zoom(.8)}><Minus size={16} /></button><span>{Math.round(camera.scale * 100)}%</span><button aria-label="Zoom in" onClick={() => zoom(1.25)}><Plus size={16} /></button><button onClick={() => fit()}><Crosshair size={15} /><span>Fit network</span></button></>}{automaticFolds.size > 0 && !showAll && <button onClick={() => { setShowAll(true); fit(radialLayout(roots, new Set([...collapsed].filter(id => explicitFolds.get(id) !== false)))); }}><Plus size={14} />Show all</button>}</div>
        {!isList && <div className="map-legend"><span><i className="health-dot online" />Online</span><span><i className="health-dot offline" />Offline</span><span><i className="health-dot backup" />Backup</span><span><i className="health-dot neutral" />Unmonitored</span></div>}
        {!isMobile && <button aria-label={editMode ? 'Done editing' : 'Edit network'} title={editMode ? 'Done editing' : 'Edit network'} aria-pressed={editMode} className={`edit-toggle ${editMode ? 'active' : ''}`} onClick={props.onEditMode}>{editMode ? <><span className="edit-toggle-pulse" aria-hidden="true" /><span className="edit-toggle-label">Now editing</span><span className="edit-toggle-done"><Check size={15} strokeWidth={2.4} />Done</span></> : <Edit3 size={18} />}</button>}
      </footer>
      {editMode && dragged && isList && <div className="root-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void moveNode(dragged, null); }}>Connect directly to Home lab</div>}
      {editMode && !dragged && <div className="edit-hint">Drag onto a node to move beneath it, or use the inspector’s parent selector.</div>}
      {moveError && !selected && <div className="network-notice" role="alert">{moveError}</div>}
      {selected && isMobile && !editorNode && <div className="sheet-backdrop" aria-hidden="true" onClick={closeInspector} />}
      {selected && <aside ref={inspector} tabIndex={-1} className={`node-inspector ${editorNode ? 'is-editing' : ''} ${sheetExpanded ? 'sheet-expanded' : ''}`} style={sheetStyle ?? undefined} aria-label={`${selected.title} details`}>
        {editorNode ? <InspectorEditor key={editorNode.id} node={editorNode} appearance={config.appearance} onCancel={finishEdit} onAddChild={() => props.onAdd(selected.id)} onDelete={keepChildren => props.onDelete(selected.id, keepChildren)} onSave={async node => { await props.onSaveNode({ ...node, children: byId.get(node.id)?.children }); }}>
          <label className="parent-picker">Parent<select aria-label="Parent" value={moveParent} onChange={e => setMoveParent(e.target.value)}><option value="">Home lab</option>{all.filter(n => n.id !== selected.id && !getAllNodes(selected.children ?? []).some(child => child.id === n.id)).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><button className="wide-action" disabled={moving || moveParent === (parents.get(selected.id) ?? '')} onClick={() => void moveNode(selected.id, moveParent || null)}>{moving ? 'Moving...' : 'Move node'}<ArrowUpRight size={14} /></button><div className="manage-actions"><button disabled={getNodeSiblingPosition(config.tree.nodes, selected.id)?.index === 0} onClick={() => props.onOrder(selected.id, 'up')}>Move earlier</button><button onClick={() => props.onOrder(selected.id, 'down')}>Move later</button></div>{moveError && <p role="alert" className="inspector-error">{moveError}</p>}
        </InspectorEditor> : <>
        <div className="inspector-heading" onPointerDown={sheetDown} onPointerMove={sheetMove} onPointerUp={sheetUp} onPointerCancel={sheetUp}>{isMobile && <span className="sheet-grabber" aria-hidden="true" />}<span className="inspector-breadcrumb"><Network size={14} />{parents.get(selected.id) ? byId.get(parents.get(selected.id)!)?.title : 'Home lab'}</span><button aria-label="Close inspector" onClick={closeInspector}><X size={18} /></button></div>
        <div className="inspector-identity"><span style={{ color: getStatusColor(selectedStatus, isNodeMonitored(selected)) }}><NodeIcon node={selected} /></span><h2>{selected.title}</h2><p>{selected.subtitle}</p><div className="inspector-status" style={{ color: getStatusColor(selectedStatus, isNodeMonitored(selected)) }}><i style={{ background: 'currentColor' }} />{statusText(selected, selectedStatus)}</div></div>
        <div className="inspector-tabs animated-segments" style={{ '--segment-index': tab === 'history' ? 1 : 0 } as CSSProperties}><button aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button><button aria-pressed={tab === 'history'} onClick={() => setTab('history')} disabled={!isNodeMonitored(selected)}>History</button></div>
        <div className="inspector-content">{tab === 'history' ? <><PeriodPicker active={period} onChange={setPeriod} /><NodeHistoryView nodeId={selected.id} period={period} accentColor="#65d7e8" /></> : <>
          <h3><Activity size={14} />Monitoring</h3>{!isNodeMonitored(selected) ? <div className="monitoring-empty"><Activity size={22} /><strong>Health checks are off</strong><p>Enable monitoring to track availability and response time.</p><button onClick={() => void beginEdit(selected)} disabled={openingEditor}>Configure monitoring<ArrowUpRight size={14} /></button></div> : <dl className="monitoring-readings"><div><dt>Response time</dt><dd>{selectedStatus?.responseTime != null ? `${selectedStatus.responseTime} ms` : '—'}</dd></div><div><dt>Last checked</dt><dd>{elapsed(selectedStatus?.lastChecked)}</dd></div><div><dt>Status changed</dt><dd>{elapsed(selectedStatus?.statusChangedAt)}</dd></div><div><dt>Health check</dt><dd>{selected.healthCheckType || (isNodeMonitored(selected) ? 'HTTP' : 'Disabled')}</dd></div></dl>}
          {selectedStatus?.error && <p className="inspector-error">{selectedStatus.error}</p>}
          {(selected.healthCheckType === 'plex' || selected.healthCheckType === 'minecraft') && <div className="inspector-activity">{selected.healthCheckType === 'plex' ? <Film size={20} /> : <Gamepad2 size={20} />}<strong>{selectedStatus?.status === 'online' ? selected.healthCheckType === 'plex' ? selectedStatus.streams ?? 0 : `${selectedStatus.players?.online ?? 0} / ${selectedStatus.players?.max ?? '—'}` : '—'}</strong><span>{selected.healthCheckType === 'plex' ? 'live streams' : 'players online'}</span></div>}
          <h3><ArrowUpRight size={14} />Connection</h3><dl className="connection-readings"><div><dt>Service address</dt><dd>{getNodeTargetUrl(selected) || 'Not configured'}</dd></div>{selected.internalAddress && selected.internalAddress !== '********' && <div><dt>Monitoring address</dt><dd>{selected.internalAddress}</dd></div>}</dl>
          {selected.backupWindow?.enabled && <><h3><Clock3 size={14} />Backup window</h3><p>{selected.backupWindow.frequency}{selected.backupWindow.frequency === 'weekly' ? ` · ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][selected.backupWindow.dayOfWeek ?? 0]}` : ''} at {String(Math.floor(selected.backupWindow.startMinute / 60)).padStart(2, '0')}:{String(selected.backupWindow.startMinute % 60).padStart(2, '0')} for {selected.backupWindow.durationMinutes} minutes. {selected.backupWindow.source === 'auto' ? 'Automatically detected.' : ''}</p></>}
          {!!selected.children?.length && <><h3><Network size={14} />Branch health</h3><div className="branch-summary"><strong>{branchStats.get(selected.id)?.total}<small>descendants</small></strong><strong>{branchStats.get(selected.id)?.online}<small>online</small></strong><strong className={branchStats.get(selected.id)?.offline ? 'has-outage' : ''}>{branchStats.get(selected.id)?.offline}<small>offline</small></strong></div></>}

          {moveError && <p role="alert" className="inspector-error">{moveError}</p>}
          {editorError && <p role="alert" className="inspector-error">{editorError}</p>}
          <button className="inspector-edit-button" onClick={() => void beginEdit(selected)} disabled={openingEditor}><Edit3 size={15} />{openingEditor ? 'Opening...' : 'Edit node'}</button>
        </>}</div>
        {getNodeTargetUrl(selected) && <footer className="inspector-bottom-actions"><button className="inspector-open-button" onClick={() => props.onOpen(selected)}><span>Open {selected.title}</span><ExternalLink size={16} /></button></footer>}
        </>}
      </aside>}
    </div>
  </main>;
}
