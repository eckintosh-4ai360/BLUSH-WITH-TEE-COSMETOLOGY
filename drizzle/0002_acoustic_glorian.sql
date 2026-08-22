CREATE TABLE `paymentPlans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`totalAmount` decimal(10,2) NOT NULL,
	`installmentAmount` decimal(10,2) NOT NULL,
	`nextDueDate` date,
	`status` enum('active','completed','paused','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentPlans_id` PRIMARY KEY(`id`)
);
