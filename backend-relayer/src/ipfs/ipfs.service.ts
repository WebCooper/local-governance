import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import FormData from 'form-data';
import axios from 'axios';

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);

  private readonly ipfsBaseUrl =
    process.env.IPFS_UPLOAD_ENDPOINT || 'http://51.210.111.188:4000';
  private readonly complaintStoreEndpoint =
    process.env.IPFS_COMPLAINT_STORE_ENDPOINT ||
    `${this.ipfsBaseUrl}/api/ipfs/complaint/store`;

  async uploadComplaint(payload: {
    description: string;
    category: string;
    location: string;
    images?: Express.Multer.File[];
  }): Promise<{ cid: string; ipfsUri: string; raw: any }> {
    try {
      const formData = new FormData();
      formData.append('description', payload.description);
      formData.append('category', payload.category);
      formData.append('location', payload.location);

      if (payload.images?.length) {
        for (const image of payload.images) {
          formData.append('images', image.buffer, {
            filename: image.originalname || 'upload.jpg',
            contentType: image.mimetype || 'image/webp',
          });
        }
      }

      this.logger.log('Uploading complaint bundle to IPFS node...');

      const response = await axios.post(this.complaintStoreEndpoint, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000,
      });

      const cid = response.data?.cid || response.data?.hash || response.data?.url;

      if (!cid) {
        this.logger.warn(
          `Upload succeeded but couldn't extract CID. Full response: ${JSON.stringify(
            response.data,
          )}`,
        );
        throw new HttpException(
          'IPFS store did not return a CID',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const ipfsUri = cid.startsWith('ipfs://') ? cid : `ipfs://${cid}`;
      this.logger.log(`✅ Complaint stored on IPFS: ${cid}`);

      return { cid, ipfsUri, raw: response.data };
    } catch (error: any) {
      this.logger.error(
        `IPFS complaint upload failed: ${error?.response?.data || error.message}`,
      );
      throw new HttpException(
        'Failed to store complaint on IPFS network',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Optional Helper: Uploads a JSON metadata object to IPFS.
   * Useful if your blockchain contract expects a single metadata URI containing the description + image links.
   */
  async uploadMetadata(metadata: Record<string, any>): Promise<string> {
    // Implement if your API endpoint supports raw JSON uploads (e.g., /api/ipfs/store-json)
    throw new Error('Method not implemented.');
  }
}