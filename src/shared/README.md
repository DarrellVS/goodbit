# @filmpje/shared

Shared code for the Filmpje application, including DTOs, types, and utilities that are used across the client, server, and publisher.

## Structure

```
shared/
├── dtos/              # Data Transfer Objects
│   └── BaseDTO.ts    # Base class for all DTOs
├── types/            # Shared TypeScript types (future)
├── utils/            # Shared utilities (future)
└── index.ts          # Main entry point
```

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

