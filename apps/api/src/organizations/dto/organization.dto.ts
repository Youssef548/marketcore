import { createZodDto } from 'nestjs-zod';
import {
  AddMemberRequestSchema,
  CreateOrganizationRequestSchema,
  OrganizationMemberSchema,
  OrganizationSchema,
} from '@app/contracts';

export class CreateOrganizationRequestDto extends createZodDto(CreateOrganizationRequestSchema) {}
export class OrganizationDto extends createZodDto(OrganizationSchema) {}
export class AddMemberRequestDto extends createZodDto(AddMemberRequestSchema) {}
export class OrganizationMemberDto extends createZodDto(OrganizationMemberSchema) {}
