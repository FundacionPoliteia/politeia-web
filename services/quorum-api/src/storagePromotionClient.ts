import type { AuthClient } from 'google-auth-library';

export type StorageApiClient = Pick<AuthClient, 'request'>;

export type StorageObject = Record<string, unknown> & {
  name: string;
  generation: string;
};

export type PlannedStorageCopy = {
  objectName: string;
  sourceBucketName: string;
  targetBucketName: string;
  sourceGeneration: string;
};

type StorageObjectList = {
  items?: StorageObject[];
  nextPageToken?: string;
};

type StorageRewriteResponse = {
  done?: boolean;
  rewriteToken?: string;
};

const storageApiBaseUrl = 'https://storage.googleapis.com/storage/v1';
const listedObjectFields = 'nextPageToken,items(name,size,md5Hash,crc32c,contentType,generation,metadata)';

function objectUrl(bucketName: string, objectName: string) {
  return `${storageApiBaseUrl}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`;
}

export async function listStorageObjects(client: StorageApiClient, bucketName: string): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await client.request<StorageObjectList>({
      url: `${storageApiBaseUrl}/b/${encodeURIComponent(bucketName)}/o`,
      params: {
        fields: listedObjectFields,
        maxResults: 1000,
        projection: 'noAcl',
        ...(pageToken ? { pageToken } : {}),
      },
    });

    const pageObjects = data.items || [];
    if (pageObjects.some((object) => !object.name || !object.generation)) {
      throw new Error(`Cloud Storage omitió el nombre o generación de un objeto en ${bucketName}.`);
    }
    objects.push(...pageObjects);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return objects;
}

export async function copyStorageObject(client: StorageApiClient, plan: PlannedStorageCopy): Promise<void> {
  const url = `${objectUrl(plan.sourceBucketName, plan.objectName)}/rewriteTo/b/${encodeURIComponent(plan.targetBucketName)}/o/${encodeURIComponent(plan.objectName)}`;
  let rewriteToken: string | undefined;

  while (true) {
    const { data } = await client.request<StorageRewriteResponse>({
      url,
      method: 'POST',
      params: {
        ifGenerationMatch: '0',
        ifSourceGenerationMatch: plan.sourceGeneration,
        ...(rewriteToken ? { rewriteToken } : {}),
      },
    });

    if (data.done) return;
    if (!data.rewriteToken) throw new Error(`Cloud Storage no devolvió token de continuación al copiar ${plan.objectName}.`);
    rewriteToken = data.rewriteToken;
  }
}
