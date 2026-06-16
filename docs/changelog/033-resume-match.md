# Resume Interrupted Match

Players who disconnect mid-match can resume from the last saved round state.
The gameplay page checks Redis for an active session on mount and restores it.
Prevents losing wager state on accidental page reload or app background.
