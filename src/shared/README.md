# @shared

Types, DTOs and constants that `src/main` and `src/renderer` both have to agree
on. Imported as `@shared/*`, which is an alias in `electron.vite.config.ts` and
a `paths` entry in both tsconfigs. It is **not** a package: it has no
`package.json`, is not built on its own, and is compiled as part of whichever
bundle imports it.

It may never import from `src/main` or `src/renderer`. Both sides depend on it,
so a dependency in the other direction would be a cycle, and the point of the
folder is that neither process owns it.

## Structure

```
shared/
├── constants/   # values both processes must not restate
├── dtos/        # the shapes that cross the bridge
└── index.ts     # the barrel both sides import from
```

Anything written out in both processes instead of living here will drift. The
OBS types did, in three places, before they were collected into
`dtos/obs/ObsDTO.ts`.

## Usage

### Creating a DTO

All DTOs should extend the `BaseDTO` class:

```typescript
import { BaseDTO } from '@filmpje/shared';

export class ClipDTO extends BaseDTO<ClipDTO, Clip> {
  id: number;
  filename: string;
  displayName?: string | null;
  game: string;
  starred: boolean;
  published: boolean;

  // Optional: Implement fromEntity to convert database entities to DTOs
  static fromEntity(entity: Clip): ClipDTO {
    const dto = new ClipDTO();
    dto.id = entity.id;
    dto.filename = entity.filename;
    dto.displayName = entity.displayName;
    dto.game = entity.game;
    dto.starred = entity.starred;
    dto.published = entity.published;
    return dto;
  }

  // Optional: Implement validate for custom validation logic
  validate() {
    const errors: string[] = [];
    
    if (!this.filename) {
      errors.push('Filename is required');
    }
    
    if (!this.game) {
      errors.push('Game is required');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
```

### Using DTOs in Server

```typescript
import { ClipDTO } from '@filmpje/shared';
import { Clip } from './entity/Clip';

// Convert entity to DTO
const clip: Clip = await clipRepository.findOne({ where: { id: 1 } });
const dto = ClipDTO.fromEntity(clip);

// Send DTO in response
res.json(dto);
```

### Using DTOs in Client

```typescript
import { ClipDTO } from '@filmpje/shared';

// Validate incoming data
const dto = new ClipDTO();
Object.assign(dto, requestData);

const validation = dto.validate();
if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
}
```

## BaseDTO Features

The `BaseDTO` class provides:

1. **`fromEntity(entity)`** - Optional static method to convert database entities to DTOs
2. **`validate()`** - Optional instance method for validation logic
3. **`toJSON()`** - Converts DTO to plain object for serialization
4. **`clone()`** - Creates a shallow copy of the DTO

## Building

```bash
npm run build    # Compile TypeScript to JavaScript
npm run watch    # Watch mode for development
npm run clean    # Remove dist directory
```

## Integration

To use this shared module in other parts of the monorepo:

1. Build the shared module: `cd shared && npm run build`
2. Link it in client/server/publisher: `npm install ../shared`
3. Import: `import { BaseDTO } from '@filmpje/shared'`

Alternatively, you can use TypeScript path mapping in each project's `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@filmpje/shared": ["../shared"]
    }
  }
}
```

