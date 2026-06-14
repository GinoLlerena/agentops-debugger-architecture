/**
 * Minimal ambient declaration for the `tablestore` SDK (no published types).
 * Typed loosely as `any`; the {@link TablestoreDocumentStore} wrapper is the
 * typed boundary the rest of the app uses.
 */
declare module 'tablestore' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped SDK; the wrapper is the typed boundary
  const TableStore: any;
  export default TableStore;
}
