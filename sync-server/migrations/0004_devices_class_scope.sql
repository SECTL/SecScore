-- 同一台设备可以同时访问多个班级。
-- 旧表只以 devices.id 作为主键，导致设备切换到另一个班级时触发
-- devices_pkey 冲突；设备记录实际属于班级同步租户，应使用复合主键。
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_pkey;
ALTER TABLE devices ADD CONSTRAINT devices_pkey PRIMARY KEY (account_id, id);
