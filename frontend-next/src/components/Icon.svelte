<script>
  import { House, Ticket, Radar, ChartColumn, FileText, Settings, LayoutDashboard, Inbox, ClipboardList, Bell, Box, List, Building2, Database, UserRound, ArrowLeftRight, ShieldAlert, Users, History, Download, ShieldCheck, Phone, Mail, KeyRound, SlidersHorizontal, Search, ChevronDown, LogOut, RefreshCw, X, Menu, CircleAlert, CircleCheck, Clock, Filter, RotateCcw, Play, Pause, Maximize, Map, Layers, Zap, TrendingUp, Activity, Check, Eye, ExternalLink, Copy, Server, Headset, GitBranch, ScanSearch, FileDown, Sparkles, Calendar, LockKeyhole, ArrowRight, Plus, ChevronRight, CircleHelp, Info } from 'lucide-svelte';
  const MAP = {
    home: House, ticket: Ticket, radar: Radar, chart: ChartColumn, file: FileText, settings: Settings, layout: LayoutDashboard,
    inbox: Inbox, form: ClipboardList, bell: Bell, cube: Box, list: List, operators: Building2, pool: Database, agent: UserRound,
    swap: ArrowLeftRight, shield: ShieldAlert, users: Users, history: History, download: Download, shieldok: ShieldCheck, phone: Phone,
    mail: Mail, key: KeyRound, sliders: SlidersHorizontal, search: Search, down: ChevronDown, logout: LogOut, refresh: RefreshCw, x: X,
    menu: Menu, alert: CircleAlert, ok: CircleCheck, clock: Clock, filter: Filter, reset: RotateCcw, play: Play, pause: Pause,
    max: Maximize, map: Map, layers: Layers, zap: Zap, trend: TrendingUp, activity: Activity, check: Check, eye: Eye, ext: ExternalLink,
    copy: Copy, server: Server, headset: Headset, branch: GitBranch, scan: ScanSearch, filedown: FileDown, sparkles: Sparkles,
    calendar: Calendar, lock: LockKeyhole, arrow: ArrowRight, plus: Plus, right: ChevronRight, help: CircleHelp, info: Info, log: ClipboardList
  };
  let { name, size = 16, stroke = 2, class: cls = '' } = $props();
  const Cmp = $derived(MAP[name] || CircleHelp);
</script>
<Cmp {size} strokeWidth={stroke} class={cls} aria-hidden="true" />
