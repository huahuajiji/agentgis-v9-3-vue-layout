import type { MapOperation } from '../../schemas/mapDocumentSchema';
import { validateMapDocumentEditState } from './mapDocumentEditValidation';
import { applyOperation, revertOperation } from './mapDocumentOperationApply';
import type { MapDocumentLike } from './mapDocumentValidation';

export type UndoRedoResult<T extends MapDocumentLike> = {
  document: T;
  operation: MapOperation | null;
};

export function undoWorkingOperation<T extends MapDocumentLike>(document: T): UndoRedoResult<T> {
  const operation = document.edit.workingOperations.at(-1) ?? null;
  if (!operation) {
    return {
      document,
      operation: null
    };
  }

  const nextDocument = revertOperation(document, operation);
  return {
    document: {
      ...nextDocument,
      edit: validateMapDocumentEditState({
        ...nextDocument.edit,
        workingOperations: document.edit.workingOperations.slice(0, -1),
        redoOperations: [...document.edit.redoOperations, operation]
      })
    } as T,
    operation
  };
}

export function redoWorkingOperation<T extends MapDocumentLike>(document: T): UndoRedoResult<T> {
  const operation = document.edit.redoOperations.at(-1) ?? null;
  if (!operation) {
    return {
      document,
      operation: null
    };
  }

  const nextDocument = applyOperation(document, operation);
  return {
    document: {
      ...nextDocument,
      edit: validateMapDocumentEditState({
        ...nextDocument.edit,
        workingOperations: [...document.edit.workingOperations, operation],
        redoOperations: document.edit.redoOperations.slice(0, -1)
      })
    } as T,
    operation
  };
}
