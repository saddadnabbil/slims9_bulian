<?php
/**
 * Create the per-member ebook reading progress table.
 *
 * One row per (member_id, file_id): stores the last reading location
 * (EPUB CFI or PDF page number), progress percentage and the member's
 * reader preferences (font size, theme, flow) as JSON.
 */

use SLiMS\Table\Schema;
use SLiMS\Table\Blueprint;

class CreateEbookReadingTable extends \SLiMS\Migration\Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    function up()
    {
        Schema::create('ebook_reading_progress', function (Blueprint $table) {
            $table->engine = 'MyISAM';
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
            $table->autoIncrement('id');
            $table->number('member_id', 11)->notNull();
            $table->number('biblio_id', 11)->notNull();
            $table->number('file_id', 11)->notNull();
            $table->string('format', 20)->notNull();
            $table->text('location');
            $table->float('percent')->nullable();
            $table->text('settings');
            $table->datetime('last_read')->notNull();
            $table->datetime('created_at')->notNull();
            $table->unique('member_id', 'file_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    function down()
    {
        Schema::drop('ebook_reading_progress');
    }
}
