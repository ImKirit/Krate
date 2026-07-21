/* changelog.js — per-version "What's new" content. The modal shows the entry
   for the version the app just updated to; add a new block per release. */
'use strict';

window.KRATE_CHANGELOG = {
  '1.3.0': {
    title: "What's new in Krate",
    items: [
      'Graph view: the whole thing now builds up piece by piece with a slim loading bar, so big libraries settle into place instead of exploding all at once.',
      'Graph view: a Tags button hides the #tag circles so you only see projects, folders and files.',
      'Graph view: full folder depth, folders sized by how much they hold, yellow folders and white files, and a Labels button (on / faint / off).',
      'Graph view: right-click pins a node exactly where it is; pins are remembered per view.',
      'Updates now show a sliding bar at the top with a one-click "Update now", instead of a popup. This "What\'s new" screen appears once after each update.',
      'You can add several default project folders and pick which one a new project goes in.',
      'Windows and dialogs can be dragged around by their title bar; the sidebar and AI panel resize.',
      'A built-in AI agent (Claude or Groq key, or sign in to a provider) that can search and read your projects, right in the panel and the quick search.',
      'Trash with restore, ZIP export, library stats, a duplicate finder, a Downloads watch folder, and krate:// links.',
      'Three themes (light, dark, purple) with a custom accent, plus start-with-Windows in the background so the search hotkey always works.',
    ],
  },
  '1.2.0': {
    title: "What's new in Krate 1.2.0",
    items: [
      'Updates now show a sliding bar at the top instead of a popup, with an Update now button.',
      'This "What\'s new" screen appears once after every update.',
      'You can add several project folders. When you make a new project you pick which one it goes in.',
      'The graph view builds up piece by piece while loading, with a progress bar, instead of appearing all at once.',
      'Windows (like this one) can be dragged around by their title bar.',
    ],
  },
  '1.1.0': {
    title: "What's new in Krate 1.1.0",
    items: [
      'Graph view rebuilt: full folder depth, folders sized by content, yellow folders and white files.',
      'Right-click pins a node in place; pins are remembered per view.',
      'A Labels button cycles folder and file names through on, faint and off.',
    ],
  },
};
