if (new URLSearchParams(location.search).has('frame')) {
  void import('./frame/mount.js')
} else {
  void import('./reviewer.js')
}
