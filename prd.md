# Knock Order — Product Requirements Document (PRD)

**Version:** 1.2
**Stage:** Frontend-first MVP → Starknet / Dojo integration later

## 1. Product Overview

Knock Order is a competitive tactical combat game where players arrange combat moves into a 5-slot sequence called an Order.

Players select a character and prepare a sequence of cards representing actions in combat.

Cards belong to three core categories:
*   **Strike** — offensive attacks
*   **Defense** — blocks and counters
*   **Control** — manipulation, feints, evasions

Each round resolves automatically based on:
*   Priority
*   Knock value
*   Card interaction rules

The game is designed to feel like a cinematic anime fight where strategic planning determines victory.

## 2. Core Design Pillars
*   **Strategic Prediction:** Victory depends on predicting the opponent’s next move.
*   **Sequenced Combat:** Players construct a 5-move combat order every round.
*   **Cinematic Resolution:** Each move resolves into a visual combat animation.
*   **Competitive PvP:** The core experience is 1v1 multiplayer combat.

## 3. Game Structure

A match consists of multiple rounds.
Each round follows this structure:
1.  Card Selection
2.  Order Locking
3.  Combat Resolution
4.  Knock Calculation
5.  Round Result

## 4. Game Modes
*   **PvP Arena:** Primary competitive mode where players fight each other.
*   **Tournament Mode:** Bracket-based elimination tournaments.
*   **Training Mode:** Practice mode against AI opponents.
*   **Story Mode (Future):** Narrative progression with boss battles.

## 5. Game Flow
Landing Page
↓
Main Menu
↓
Character Selection
↓
Match Setup
↓
Card Selection
↓
Order Lock
↓
Combat Resolution
↓
Round Result
↓
Next Round / Match End

## 6. Screens & UX

**Landing Page**
*   Elements: Game logo, Animated fighters background, Enter Game button, Navigation menu
*   Menu items: Play, Tournament, Story, Community

**Main Menu**
*   Sections: Play, Decks, Profile

**Character Selection Screen**
*   Players select their fighter.
*   Layout: Left side → Player roster, Right side → Opponent roster
*   Features: Character portraits, Character stats preview, Lock-in button
*   Once both players lock their character, the game transitions to the VS Screen.

**VS Screen**
*   Displays: Player character, Opponent character, Large animated VS
*   Primary button: Prepare Your Order

**Card Selection Screen**
*   Players choose 5 cards for the round.
*   Top navigation tabs: ALL CARDS, STRIKE, DEFENSE, CONTROL
*   Main section: Card grid library.
*   Bottom section: ORDER SLOT 1, ORDER SLOT 2, ORDER SLOT 3, ORDER SLOT 4, ORDER SLOT 5
*   Players drag cards into slots.

## 7. Card System

Cards are divided into three categories.

**Strike Cards**
*   Offensive actions.
*   Examples: Phantom Break, Storm Kick, Power Punch, Direct Impact
*   Effects: Apply knock damage, Can be blocked by defense cards

**Defense Cards**
*   Defensive actions.
*   Examples: Guard Stance, Stability, Reversal Edge, Anticipation
*   Effects: Reduce knock damage, Counter attacks

**Control Cards**
*   Manipulation and mind games.
*   Examples: Mind Game, Evasion, Pressure Advance, Disrupt
*   Effects: Interrupt attacks, Force reactions, Manipulate combat timing

## 8. Card Properties

Each card includes:
*   Card ID
*   Name
*   Type (Strike / Defense / Control)
*   Energy Cost
*   Priority
*   Knock Value
*   Special Effect
*   Animation ID

Example: Reversal Edge
*   Type: Defense
*   Priority: 3
*   Knock: 4
*   Effect: Reflect incoming strike damage
*   Animation: reversal_edge

## 9. Combat System

Combat resolves automatically.
Players create an Order of 5 cards.
Slots resolve sequentially:
*   Slot 1
*   Slot 2
*   Slot 3
*   Slot 4
*   Slot 5

## 10. Priority System

Priority determines which move executes first.
Higher priority resolves before lower priority.
Example: Priority 3 executes before Priority 2

## 11. Knock System

Knock represents combat damage.
When knock exceeds a threshold, a player becomes vulnerable.
Vulnerable players can be defeated with strong moves.

## 12. Combat Interaction Matrix

Card interactions follow rules:
*   Strike beats Control
*   Control beats Defense
*   Defense beats Strike

Counters override this system.

## 13. Round Resolution Logic

For each slot:
1.  Reveal cards
2.  Compare priority
3.  Resolve card interaction
4.  Apply knock damage
5.  Trigger animation

After Slot 5:
Total knock is calculated.

## 14. Silhouette Combat Animation System

Knock Order uses lightweight silhouette combat videos to visualize card interactions.
Instead of static combat resolution, each move triggers a short combat video clip.

These animations feature:
*   Black silhouette fighters
*   Neon aura effects
*   Minimal environment
*   Lightweight video files

This keeps the game cinematic while remaining performant.

## 15. Slot Animation Flow

Each round contains 5 combat slots.
When both players lock their orders, the combat sequence begins.

For each slot:
*   Both cards are revealed
*   Priority determines execution order
*   Card interaction resolves
*   Corresponding silhouette action video plays
*   Knock damage is applied
*   UI updates player state

Example:
**Slot 1**
*   Player A → Phantom Break
*   Player B → Guard Stance
*   Animation → Punch attack vs block

## 16. Animation Duration

Each silhouette animation lasts approximately: 0.8s – 1.5s
This keeps combat pacing fast.

## 17. Animation Assets

Animation files stored in: `/assets/animations/`
Example files:
*   `phantom_break.mp4`
*   `storm_kick.mp4`
*   `reversal_edge.mp4`
*   `evasion.mp4`
*   `mind_game.mp4`

Recommended format:
*   MP4 (H264)
*   720p
*   ~1 second duration
*   No audio

## 18. Animation Trigger System

Each card contains an animation reference.

Example:
```json
{
 "id": "phantom_break",
 "type": "strike",
 "priority": 2,
 "knock": 6,
 "animation": "phantom_break"
}
```

During slot resolution: `playAnimation(card.animation)`

## 19. Combat Viewer Component

The frontend includes a CombatViewer component responsible for:
*   Playing silhouette animations
*   Sequencing slot resolution
*   Displaying hit effects
*   Updating knock UI

Flow:
`CombatViewer → load animation → play video → apply knock → update UI`

## 20. Victory Conditions

A player wins when:
*   Opponent stability reaches zero
OR
*   Best of three rounds is won

## Game Mechanics Specification

**Core Variables**
*   Priority (P) → determines order
*   Knock (K) → damage impact
*   Energy Cost (E) → card usage cost

**Order System**
Players construct:
`Order = [Slot1, Slot2, Slot3, Slot4, Slot5]`
Each slot contains one card.

**Slot Resolution Algorithm**
For each slot:
1.  compare priority
2.  resolve higher priority
3.  apply effects
4.  apply knock
5.  play silhouette animation

## Frontend Architecture Blueprint

**Technology Stack**
*   Next.js (App Router)
*   React
*   TypeScript
*   TailwindCSS
*   WebSocket client

**Folder Structure**
```
/app
/components
  /cards
  /characters
  /game
/hooks
/utils
/assets
  /animations
```

**Core Components**
*   Navbar
*   CharacterGrid
*   CardLibrary
*   CardTile
*   OrderSlots
*   CombatViewer
*   RoundResultModal

**Frontend Game State**
Managed with: Zustand or React Context

Example state:
*   matchState
*   playerDeck
*   currentOrder
*   opponentOrder
*   roundResult

**Core Pages**
*   `/landing`
*   `/menu`
*   `/characters`
*   `/cards`
*   `/match`
*   `/combat`

**Combat Engine (Frontend MVP)**
Combat logic runs locally.
Example function: `resolveSlot(playerCard, opponentCard)`
Returns: `winner`, `knockDamage`, `animationTrigger`

**Multiplayer Sync (Frontend MVP)**
Temporary networking: WebSocket
Messages: `PLAYER_READY`, `ORDER_LOCKED`, `ROUND_RESULT`

**Future Blockchain Integration**
When Starknet integration begins:
Replace local game state with Dojo ECS world state.

Entities:
*   Player
*   Match
*   Card
*   Round
*   OrderSlot

Systems:
*   ResolveRoundSystem
*   ApplyKnockSystem
*   MatchEndSystem
