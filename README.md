# fix-nestjs-swc-circular

When switching to the SWC builder for NestJS, you often run into issues with circular dependencies, because the type being specified below the `@Inject(forwardRef(...))` call (or the `@ManyToOne(...)` call, if you use TypeORM) tells SWC to import eagerly. A way around this is using the `Relation` helper from TypeORM, which lets SWC know that the import in that location is only used as a type.

This is a helper script that goes over TypeScript files in a certain directory and adds the `Relation` helper to places that SWC might need it to be in.
