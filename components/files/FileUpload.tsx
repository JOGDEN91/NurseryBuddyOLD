- export default function FileUpload(props: { ...existingProps }) {
+ export default function FileUpload(props: {
+   ...existingProps;
+   ownerId?: string;             // who "owns" the file
+   defaultChildId?: string;      // optional association
+   defaultDocType?: string;      // e.g. "parent_upload"
+ }) {

+  const { ownerId, defaultChildId, defaultDocType } = props;

   async function handleUpload(file: File, meta?: any) {
-    await repo.uploadFile(file, meta);
+    await repo.uploadFile(file, {
+      ...(meta ?? {}),
+      ...(ownerId ? { ownerId } : {}),
+      ...(defaultChildId ? { child_id: defaultChildId } : {}),
+      ...(defaultDocType ? { doc_type: defaultDocType } : {}),
+    });
   }

   // UI unchanged; if you already expose metadata fields, seed their defaults from props
}