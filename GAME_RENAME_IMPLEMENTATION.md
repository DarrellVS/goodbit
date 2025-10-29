# Game Rename Feature Implementation

## Overview
Implemented a feature that allows users to rename games with a custom display name without changing the actual folder name on disk (which OBS records to).

## What Was Changed

### Backend (Server)

1. **New Entity**: `server/src/entity/Game.ts`
   - Stores game name (folder name - immutable) and displayName (user-defined, nullable)
   - Automatically creates entries for all games found in clips

2. **New Actions**:
   - `SyncGamesAction.ts`: Syncs Game table with clips (ensures backward compatibility)
   - `UpdateGameAction.ts`: Updates game displayName and refreshes metadata for all published clips

3. **Updated Actions**:
   - `PublishClipAction.ts`: Now uses game displayName in metadata
   - `SyncPublisherAction.ts`: Uses game displayName when syncing
   - `ScanAndSyncClipsAction.ts`: Auto-creates Game entries when scanning

4. **Updated Routes**: `server/src/routes/games.ts`
   - GET `/api/games`: Returns games with displayName
   - PATCH `/api/games/:name`: Updates game displayName

5. **Server Startup**: `server/src/index.ts`
   - Runs SyncGamesAction on startup for backward compatibility

### Shared

1. **Updated DTO**: `shared/dtos/game/GameDTO.ts`
   - Added `displayName: string | null` field

### Frontend (Client)

1. **New Component**: `client/src/components/App/GameRenameDialog.vue`
   - Dialog for renaming games with input validation
   - Shows both display name and immutable folder name

2. **Updated Component**: `client/src/components/App/SidebarGames.vue`
   - Shows displayName (falls back to folder name if not set)
   - Added pencil icon button on hover to rename games
   - Integrated with GameRenameDialog

3. **Updated Service**: `client/src/services/games.ts`
   - Added `updateGameName()` function

## How It Works

### For Existing Data
1. On server startup, `SyncGamesAction` creates Game entries for all games found in clips
2. Display names are initially null, so games show their folder names
3. Users can then rename games, which updates only the displayName field

### For New Data
1. When scanning clips, new games are automatically added to the Game table
2. Display names remain null until user sets them

### For Published Clips
1. When a game is renamed, `UpdateGameAction` re-publishes metadata for all published clips
2. Publisher metadata files (.meta.json) are updated with the new game display name
3. This ensures Discord embeds and other integrations show the correct game name

## User Experience

1. **Sidebar**: Games show their display name (or folder name if not set)
2. **Rename**: Hover over a game → click pencil icon → enter display name
3. **Reset**: Clear the display name to revert to folder name
4. **Folder Unchanged**: The actual folder on disk remains unchanged (OBS compatibility)

## Backward Compatibility

✅ Existing installations automatically populate Game table on first startup
✅ Games without display names show their folder names
✅ No data migration required
✅ All published clips get updated metadata when game is renamed

## API Reference

### GET /api/games
Returns list of games with displayName:
```json
[
  {
    "game": "Counter-Strike 2",
    "displayName": "CS2",
    "clipCount": 42
  }
]
```

### PATCH /api/games/:name
Updates game display name:
```json
{
  "displayName": "CS2"  // or null to clear
}
```

Response:
```json
{
  "game": { "name": "Counter-Strike 2", "displayName": "CS2" },
  "publishedClipsUpdated": 15
}
```

## Testing Checklist

- [x] Create Game entity
- [x] Sync games on startup
- [x] Display games with displayName in sidebar
- [x] Rename dialog works
- [x] Update game displayName via API
- [x] Published clip metadata updates
- [x] Backward compatibility with existing data
- [x] TypeScript types are correct
- [x] No linter errors

## Notes

- Folder names never change (maintains OBS recording compatibility)
- Display names are optional (nullable)
- Published clips automatically get updated metadata
- Game entities are auto-created during clip scanning

