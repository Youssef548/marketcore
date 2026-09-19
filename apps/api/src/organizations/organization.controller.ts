import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Organization, OrganizationMember } from '@app/contracts';
import type { TenantContext } from '@app/domain';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { OwnerOnly } from '../security/decorators/owner-only.decorator';
import { Tenant } from '../security/decorators/tenant.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import type { AuthenticatedUser } from '../security/request-context.interface';
import {
  AddMemberRequestDto,
  CreateOrganizationRequestDto,
  OrganizationDto,
  OrganizationMemberDto,
} from './organization.dto';
import { OrganizationService } from './organization.service';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /** Tenant-free: creating an organization cannot require naming one. */
  @Post()
  @TenantFree()
  @ApiCreatedResponse({ type: OrganizationDto })
  create(
    @Body() body: CreateOrganizationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organization> {
    return this.organizationService.create(body.name, body.slug, user.id);
  }

  /** Tenant-free: this is how a client discovers which header values are legal. */
  @Get()
  @TenantFree()
  @ApiOkResponse({ type: [OrganizationDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Organization[]> {
    return this.organizationService.listForUser(user.id);
  }

  @Get('members')
  @ApiOkResponse({ type: [OrganizationMemberDto] })
  listMembers(@Tenant() tenant: TenantContext): Promise<OrganizationMember[]> {
    return this.organizationService.listMembers(tenant);
  }

  @Post('members')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  addMember(@Tenant() tenant: TenantContext, @Body() body: AddMemberRequestDto): Promise<void> {
    return this.organizationService.addMember(tenant, body.email);
  }

  @Delete('members/:userId')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeMember(@Tenant() tenant: TenantContext, @Param('userId') userId: string): Promise<void> {
    return this.organizationService.removeMember(tenant, userId);
  }
}
