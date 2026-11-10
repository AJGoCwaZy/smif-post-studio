/* SMIF Post Studio: brand tokens.
   This is the only place colors, fonts, sizes and themes are defined.
   app.js copies these into CSS variables when the page loads.
   To change the brand, edit the values below and refresh the page. */
window.SMIF = window.SMIF || {};

SMIF.brand = {
  appName: 'SMIF Post Studio',
  clubName: 'SMIF Club at FIU',
  // Two short lines shown at the bottom right of every post. Change or empty it here.
  tagline: ['Student Managed', 'Investment Fund'],

  colors: {
    green: '#143526',
    gold: '#B8955C',
    goldDeep: '#7F6030',
    ivory: '#F4EFE6',
    paper: '#FBF8F2',
    charcoal: '#222725',
    ink: '#1D2421'
  },

  // Thin accent used only on division posts.
  divisions: [
    { id: 'equities', name: 'Equities', color: '#28706C' },
    { id: 'fixed-income', name: 'Fixed Income', color: '#78845B' },
    { id: 'derivatives', name: 'Derivatives', color: '#813F4A' },
    { id: 'quant', name: 'Quant', color: '#46689B' },
    { id: 'real-estate', name: 'Real Estate', color: '#B46A4D' }
  ],

  fonts: {
    display: 'Playfair Display',
    ui: 'Montserrat',
    displayStack: '"Playfair Display", Georgia, serif',
    uiStack: 'Montserrat, "Helvetica Neue", Arial, sans-serif'
  },
  // Every weight the app draws with. All of them are loaded before drawing and before export.
  fontLoads: [
    '600 32px "Playfair Display"',
    '700 32px "Playfair Display"',
    '800 32px "Playfair Display"',
    'italic 600 32px "Playfair Display"',
    '400 32px "Montserrat"',
    '500 32px "Montserrat"',
    '600 32px "Montserrat"',
    '700 32px "Montserrat"'
  ],
  fontLinks: [
    { name: 'Playfair Display', use: 'Headlines', url: 'https://fonts.google.com/specimen/Playfair+Display' },
    { name: 'Montserrat', use: 'Labels and body text', url: 'https://fonts.google.com/specimen/Montserrat' }
  ],

  sizes: [
    { id: 'post', label: 'Post', note: '1080 x 1350', w: 1080, h: 1350 },
    { id: 'story', label: 'Story', note: '1080 x 1920', w: 1080, h: 1920 },
    { id: 'square', label: 'Square', note: '1080 x 1080', w: 1080, h: 1080 },
    { id: 'linkedin', label: 'LinkedIn', note: '1200 x 627', w: 1200, h: 627 }
  ],
  // Instagram covers these parts of a story with its own buttons.
  storySafe: { top: 250, bottom: 340 },

  // Which logo file each theme uses (keys of the files below).
  logos: [
    { id: 'green-gold', label: 'Green and gold', file: 'assets/logo-green-gold.png', onTheme: 'ivory' },
    { id: 'ivory-gold', label: 'Ivory and gold', file: 'assets/logo-ivory-gold.png', onTheme: 'green' },
    { id: 'ivory', label: 'Ivory', file: 'assets/logo-ivory.png', onTheme: 'green' },
    { id: 'green', label: 'Green', file: 'assets/logo-green.png', onTheme: 'ivory' }
  ],

  themes: {
    green: {
      label: 'Green',
      bg: '#143526', bg2: '#1C4631',
      text: '#F4EFE6', muted: 'rgba(244,239,230,0.74)',
      accent: '#B8955C', accentText: '#C9A66B',
      logo: 'ivory-gold',
      panel: '#1F4A35', tile: '#F4EFE6', onTile: '#143526'
    },
    ivory: {
      label: 'Ivory',
      bg: '#F4EFE6', bg2: '#FBF8F2',
      text: '#143526', muted: 'rgba(20,53,38,0.74)',
      accent: '#B8955C', accentText: '#7F6030',
      logo: 'green-gold',
      panel: '#E6DECF', tile: '#FFFFFF', onTile: '#143526'
    },
    charcoal: {
      label: 'Charcoal',
      bg: '#222725', bg2: '#2D3431',
      text: '#F4EFE6', muted: 'rgba(244,239,230,0.74)',
      accent: '#B8955C', accentText: '#C9A66B',
      logo: 'ivory-gold',
      panel: '#303835', tile: '#F4EFE6', onTile: '#222725'
    }
  },

  // Look of the editor itself (not the posts).
  ui: {
    radius: '10px'
  }
};
