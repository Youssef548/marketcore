import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so feature modules never have to import it explicitly. It is the only
 * bridge between the apps and @app/database, and it lives here rather than in
 * apps/api so the worker can use it too — apps may not import each other.
 */
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
