import App from './App.svelte';
import { mount } from 'svelte';
import './style.css';
mount(App,{target:document.getElementById('app')});
window.__unextFrontendMounted = true;
window.dispatchEvent(new Event('unext-frontend-ready'));
