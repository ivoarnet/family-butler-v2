BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Household] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [holidayRegion] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Household_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Household_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[HouseholdMember] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [householdId] UNIQUEIDENTIFIER NOT NULL,
    [firstName] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000),
    [avatarColor] NVARCHAR(1000) NOT NULL,
    [avatarPhotoUrl] NVARCHAR(1000),
    [visibleInCalendar] BIT NOT NULL CONSTRAINT [HouseholdMember_visibleInCalendar_df] DEFAULT 1,
    [order] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [HouseholdMember_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [HouseholdMember_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [HouseholdMember_householdId_order_key] UNIQUE NONCLUSTERED ([householdId],[order])
);

-- CreateTable
CREATE TABLE [dbo].[Contact] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [householdId] UNIQUEIDENTIFIER NOT NULL,
    [firstName] NVARCHAR(1000) NOT NULL,
    [lastName] NVARCHAR(1000),
    [mobilePhone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [birthDay] SMALLINT,
    [birthMonth] SMALLINT,
    [birthYear] SMALLINT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Contact_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Contact_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[EventCategory] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [householdId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [color] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EventCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [EventCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EventCategory_householdId_name_key] UNIQUE NONCLUSTERED ([householdId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[Event] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [householdId] UNIQUEIDENTIFIER NOT NULL,
    [householdMemberId] UNIQUEIDENTIFIER NOT NULL,
    [contactId] UNIQUEIDENTIFIER,
    [categoryId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [startAt] DATETIME2 NOT NULL,
    [endAt] DATETIME2,
    [allDay] BIT NOT NULL CONSTRAINT [Event_allDay_df] DEFAULT 0,
    [isRecurring] BIT NOT NULL CONSTRAINT [Event_isRecurring_df] DEFAULT 0,
    [rrule] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Event_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Event_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DayConfiguration] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [householdId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE,
    [source] NVARCHAR(1000) NOT NULL CONSTRAINT [DayConfiguration_source_df] DEFAULT 'CUSTOM',
    [displayColor] NVARCHAR(1000),
    [relatedDayConfigurationId] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DayConfiguration_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DayConfiguration_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HouseholdMember_householdId_order_idx] ON [dbo].[HouseholdMember]([householdId], [order]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contact_householdId_firstName_lastName_idx] ON [dbo].[Contact]([householdId], [firstName], [lastName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Event_householdId_startAt_idx] ON [dbo].[Event]([householdId], [startAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Event_householdMemberId_startAt_idx] ON [dbo].[Event]([householdMemberId], [startAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Event_contactId_idx] ON [dbo].[Event]([contactId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Event_categoryId_idx] ON [dbo].[Event]([categoryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DayConfiguration_householdId_startDate_idx] ON [dbo].[DayConfiguration]([householdId], [startDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DayConfiguration_householdId_endDate_idx] ON [dbo].[DayConfiguration]([householdId], [endDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DayConfiguration_relatedDayConfigurationId_idx] ON [dbo].[DayConfiguration]([relatedDayConfigurationId]);

-- AddForeignKey
ALTER TABLE [dbo].[HouseholdMember] ADD CONSTRAINT [HouseholdMember_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Contact] ADD CONSTRAINT [Contact_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[EventCategory] ADD CONSTRAINT [EventCategory_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Event] ADD CONSTRAINT [Event_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Event] ADD CONSTRAINT [Event_householdMemberId_fkey] FOREIGN KEY ([householdMemberId]) REFERENCES [dbo].[HouseholdMember]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Event] ADD CONSTRAINT [Event_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Event] ADD CONSTRAINT [Event_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[EventCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DayConfiguration] ADD CONSTRAINT [DayConfiguration_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[DayConfiguration] ADD CONSTRAINT [DayConfiguration_relatedDayConfigurationId_fkey] FOREIGN KEY ([relatedDayConfigurationId]) REFERENCES [dbo].[DayConfiguration]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

