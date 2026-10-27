<script>
  // Six single-digit boxes for the emailed code.
  // Typing moves to the next box, Backspace goes back, pasting fills all boxes,
  // and `oncomplete` fires as soon as all six digits are present (auto-verify).
  let { value = $bindable(''), oncomplete = () => {}, disabled = false, autofocus = true } = $props();
  const N = 6;
  let boxes = [];
  let digits = $state(Array.from({ length: N }, (_, i) => value[i] || ''));
  let fired = '';
  function sync() {
    value = digits.join('');
    if (value.length === N && /^\d{6}$/.test(value) && fired !== value) { fired = value; oncomplete(value); }
    if (value.length < N) fired = '';
  }
  function setFrom(i, text) {
    const d = String(text).replace(/\D/g, '').slice(0, N - i).split('');
    if (!d.length) return;
    d.forEach((c, k) => (digits[i + k] = c));
    sync();
    boxes[Math.min(i + d.length, N - 1)]?.focus();
  }
  function onInput(i, e) { const v = e.target.value; digits[i] = ''; e.target.value = ''; if (v) setFrom(i, v); else sync(); }
  function onKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); digits[i - 1] = ''; sync(); boxes[i - 1]?.focus(); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && i < N - 1) { e.preventDefault(); boxes[i + 1]?.focus(); }
  }
  function onPaste(i, e) { e.preventDefault(); setFrom(0, e.clipboardData?.getData('text') || ''); }
  // external reset (e.g. after a wrong code)
  $effect(() => { if (value === '' && digits.some(Boolean)) { digits = Array(N).fill(''); fired = ''; boxes[0]?.focus(); } });
  $effect(() => { if (autofocus) boxes[0]?.focus(); });
</script>

<div class="otp" role="group" aria-label="One-time code">
  {#each digits as d, i}
    <input bind:this={boxes[i]} class="box" class:filled={!!d} value={d} {disabled} inputmode="numeric" pattern="[0-9]*" maxlength={i === 0 ? N : 1}
      autocomplete={i === 0 ? 'one-time-code' : 'off'} aria-label="Digit {i + 1} of {N}"
      oninput={(e) => onInput(i, e)} onkeydown={(e) => onKey(i, e)} onpaste={(e) => onPaste(i, e)} onfocus={(e) => e.target.select()} />
    {#if i === 2}<span class="gap" aria-hidden="true"></span>{/if}
  {/each}
</div>

<style>
  .otp { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  .box { width: 100%; min-width: 0; max-width: 56px; height: 56px; text-align: center; font-size: 24px; font-weight: 750; font-variant-numeric: tabular-nums;
    border: 1.5px solid var(--line); border-radius: 12px; background: #fff; color: var(--ink); outline: none; transition: border-color .15s, box-shadow .15s; padding: 0; }
  .box:focus { border-color: var(--brand); box-shadow: 0 0 0 4px rgba(242,107,29,.15); }
  .box.filled { border-color: #f4b48a; background: #fffaf6; }
  .box:disabled { opacity: .6; }
  .gap { width: 6px; flex: none; }
  @media (max-width: 380px) { .otp { gap: 5px; } .box { height: 48px; font-size: 20px; border-radius: 10px; } }
</style>
