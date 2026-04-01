- export default function FileList(props: { ...existingProps }) {
+ export default function FileList(props: { ...existingProps, mineOnly?: boolean; ownerId?: string }) {

+  const { mineOnly, ownerId } = props;

-  const files = await repo.listFiles({ ...existingQuery });
+  const files = await repo.listFiles({
+    ...existingQuery,
+    ...(mineOnly && ownerId ? { ownerId } : {}),
+  });

  // If you fetch then filter on client instead, keep server query unchanged and add:
+ // const visibleFiles = mineOnly && ownerId ? files.filter(f => f.ownerId === ownerId) : files;
+ // render `visibleFiles` instead of `files`.
}